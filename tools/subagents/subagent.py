#!/usr/bin/env python3
"""CLI wrapper to dispatch tasks to remote coding sub-models (Kimi via Ollama Cloud, GLM via z.ai).

Used by the lead agent (Claude) to delegate implementation work instead of doing it directly.
"""
import argparse
import os
import re
import sys
import json
import requests

PROVIDERS = {
    "kimi": {
        "url": "https://ollama.com/v1/chat/completions",
        "model": "kimi-k2.7-code",
        "key_env": "OLLAMA_API_KEY",
        "models_url": "https://ollama.com/v1/models",
    },
    "glm": {
        "url": "https://api.z.ai/api/coding/paas/v4/chat/completions",
        "model": "glm-5.2",
        "key_env": "GLM_API_KEY",
        "models_url": "https://api.z.ai/api/coding/paas/v4/models",
    },
}

APPLY_INSTRUCTIONS = (
    "When asked to create or modify files, respond ONLY with one block per file, "
    "no commentary before/after, using exactly this format (no markdown fences):\n"
    "===FILE: relative/path/to/file.ext===\n"
    "<full file content>\n"
    "===END FILE===\n"
    "Always output the COMPLETE file content, not a diff or partial snippet."
)

DEFAULT_SYSTEM = (
    "You are a coding sub-agent working for a lead AI orchestrator (Claude). "
    "Produce correct, production-quality, minimal-diff solutions. Do not add unrequested "
    "features, comments, or refactors. Be direct, no preamble."
)


def resolve_target(name):
    if name in PROVIDERS:
        p = PROVIDERS[name]
        return p["url"], p["model"], os.environ.get(p["key_env"]), p["key_env"]
    if ":" in name:
        provider, model = name.split(":", 1)
        if provider not in PROVIDERS:
            sys.exit(f"Unknown provider '{provider}'. Use one of: {', '.join(PROVIDERS)}")
        p = PROVIDERS[provider]
        return p["url"], model, os.environ.get(p["key_env"]), p["key_env"]
    sys.exit(f"Unknown model alias '{name}'. Use 'kimi', 'glm', or 'provider:model-id'.")


def read_files(paths):
    chunks = []
    for path in paths:
        try:
            with open(path, "r", errors="replace") as f:
                content = f.read()
        except OSError as e:
            sys.exit(f"Cannot read file {path}: {e}")
        chunks.append(f"--- FILE: {path} ---\n{content}\n--- END FILE: {path} ---")
    return "\n\n".join(chunks)


def apply_file_blocks(text, base_dir="."):
    pattern = re.compile(r"===FILE: (.+?)===\n(.*?)\n===END FILE===", re.DOTALL)
    matches = pattern.findall(text)
    if not matches:
        print("No ===FILE=== blocks found in response; nothing applied.", file=sys.stderr)
        return []
    written = []
    for rel_path, content in matches:
        rel_path = rel_path.strip()
        full_path = os.path.join(base_dir, rel_path)
        os.makedirs(os.path.dirname(full_path) or ".", exist_ok=True)
        with open(full_path, "w") as f:
            f.write(content)
        written.append(full_path)
    return written


def list_models(name):
    p = PROVIDERS.get(name)
    if not p:
        sys.exit(f"Unknown provider '{name}'. Use one of: {', '.join(PROVIDERS)}")
    key = os.environ.get(p["key_env"])
    if not key:
        sys.exit(f"Missing env var {p['key_env']}")
    r = requests.get(p["models_url"], headers={"Authorization": f"Bearer {key}"}, timeout=30)
    r.raise_for_status()
    for m in r.json().get("data", []):
        print(m["id"])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("model", help="'kimi', 'glm', 'provider:model-id', or '--list-models <provider>'")
    ap.add_argument("prompt", nargs="*", help="Task/prompt text (or use --prompt-file / --stdin)")
    ap.add_argument("--files", nargs="*", default=[], help="File paths to include as read-only context")
    ap.add_argument("--prompt-file", help="Read prompt text from a file")
    ap.add_argument("--stdin", action="store_true", help="Read prompt text from stdin")
    ap.add_argument("--system", help="Override system prompt")
    ap.add_argument("--apply", action="store_true", help="Parse ===FILE=== blocks from response and write them to disk")
    ap.add_argument("--base-dir", default=".", help="Base dir for --apply writes (default: cwd)")
    ap.add_argument("--max-tokens", type=int, default=8000)
    ap.add_argument("--temperature", type=float, default=0.3)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--raw", action="store_true", help="Print full raw JSON response")
    ap.add_argument("--verbose", action="store_true", help="Print reasoning/thinking to stderr if present")
    ap.add_argument("--list-models", action="store_true", help="List available models for the given provider and exit")
    args = ap.parse_args()

    if args.list_models:
        list_models(args.model)
        return

    url, model, api_key, key_env = resolve_target(args.model)
    if not api_key:
        sys.exit(f"Missing API key: env var {key_env} is not set")

    if args.prompt_file:
        with open(args.prompt_file) as f:
            task_text = f.read()
    elif args.stdin:
        task_text = sys.stdin.read()
    elif args.prompt:
        task_text = " ".join(args.prompt)
    else:
        sys.exit("No prompt given (use positional prompt, --prompt-file, or --stdin)")

    user_content = task_text
    if args.files:
        user_content = read_files(args.files) + "\n\n--- TASK ---\n" + task_text

    system_prompt = args.system or DEFAULT_SYSTEM
    if args.apply:
        system_prompt += "\n\n" + APPLY_INSTRUCTIONS

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
    }

    try:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=args.timeout,
        )
    except requests.RequestException as e:
        sys.exit(f"Request failed: {e}")

    if resp.status_code != 200:
        sys.exit(f"HTTP {resp.status_code} from {model}: {resp.text[:2000]}")

    data = resp.json()
    if args.raw:
        print(json.dumps(data, indent=2))
        return

    message = data["choices"][0]["message"]
    content = message.get("content", "")

    if args.verbose:
        reasoning = message.get("reasoning") or message.get("reasoning_content")
        if reasoning:
            print(f"--- {model} reasoning ---\n{reasoning}\n--- end reasoning ---", file=sys.stderr)

    if args.apply:
        written = apply_file_blocks(content, args.base_dir)
        for path in written:
            print(f"WROTE: {path}")
        if not written:
            print(content)
    else:
        print(content)


if __name__ == "__main__":
    main()
