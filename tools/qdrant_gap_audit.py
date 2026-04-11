"""
TruckOpti Codebase Gap & Mismatch Audit
Uses Roo Code's live Qdrant index (port 6335) + Ollama nomic-embed-text-v2-moe
to semantically audit the frontend for missing patterns, inconsistencies and gaps.

Usage:  python tools/qdrant_gap_audit.py
Output: 0.dev-matrix/QDRANT_GAP_REPORT.md
"""

import json
import os
import re
import sys
import requests
from collections import defaultdict
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
QDRANT_URL   = "http://localhost:6335"
COLLECTION   = "ws-6df6af38d373c83b"   # TruckOpti workspace (112k points)
OLLAMA_URL   = "http://localhost:11434"
EMBED_MODEL  = "nomic-embed-text-v2-moe"
FRONTEND_SRC = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "src")
REPORT_PATH  = "0.dev-matrix/QDRANT_GAP_REPORT.md"
SEARCH_LIMIT  = 12   # top-k results per query
SCORE_FLOOR   = 0.65  # minimum cosine similarity to include


# ── Helpers ──────────────────────────────────────────────────────────────────
def embed(text: str) -> list[float]:
    r = requests.post(f"{OLLAMA_URL}/api/embed",
                      json={"model": EMBED_MODEL, "input": text}, timeout=30)
    r.raise_for_status()
    return r.json()["embeddings"][0]


def search(vector: list[float], file_filter: dict | None = None, limit: int = SEARCH_LIMIT):
    body: dict = {"vector": vector, "limit": limit, "with_payload": True, "score_threshold": SCORE_FLOOR}
    if file_filter:
        body["filter"] = file_filter
    r = requests.post(f"{QDRANT_URL}/collections/{COLLECTION}/points/search",
                      json=body, timeout=30)
    r.raise_for_status()
    return r.json().get("result", [])


def scroll_filter(must: list[dict], limit: int = 5000) -> list[dict]:
    """Paginate through all matching points (respects Qdrant 250-per-page max)."""
    all_points: list[dict] = []
    offset = None
    page_size = min(250, limit)
    while True:
        body: dict = {"filter": {"must": must}, "limit": page_size, "with_payload": True, "with_vector": False}
        if offset:
            body["offset"] = offset
        r = requests.post(f"{QDRANT_URL}/collections/{COLLECTION}/points/scroll",
                          json=body, timeout=30)
        r.raise_for_status()
        result = r.json().get("result", {})
        pts = result.get("points", [])
        all_points.extend(pts)
        offset = result.get("next_page_offset")
        if not offset or len(all_points) >= limit:
            break
    return all_points[:limit]


def frontend_filter(extra_must: list[dict] | None = None) -> dict:
    must = [{"key": "pathSegments.0", "match": {"value": "frontend"}},
            {"key": "pathSegments.1", "match": {"value": "src"}}]
    if extra_must:
        must.extend(extra_must)
    return {"must": must}


def fmt_hit(h: dict) -> str:
    p = h.get("payload", {})
    score = h.get("score", 0)
    fp = p.get("filePath", "?"); sl = p.get("startLine", "?")
    chunk = p.get("codeChunk", "").strip().replace("\n", " ↵ ")[:120]
    return f"  [{score:.2f}] {fp}:{sl}  `{chunk}`"


# ── Structural scans (no embedding needed) ──────────────────────────────────
def scan_all_pages() -> dict[str, list[dict]]:
    """Return {fileName: [chunks]} for all .tsx files in frontend/src/pages."""
    points = scroll_filter([
        {"key": "pathSegments.0", "match": {"value": "frontend"}},
        {"key": "pathSegments.1", "match": {"value": "src"}},
        {"key": "pathSegments.2", "match": {"value": "pages"}},
    ], limit=2000)
    by_file: dict[str, list[dict]] = defaultdict(list)
    for pt in points:
        fp = pt["payload"].get("filePath", "")
        if fp.endswith(".tsx") or fp.endswith(".ts"):
            by_file[fp].append(pt)
    return dict(by_file)


def scan_all_components() -> dict[str, list[dict]]:
    points = scroll_filter([
        {"key": "pathSegments.0", "match": {"value": "frontend"}},
        {"key": "pathSegments.1", "match": {"value": "src"}},
        {"key": "pathSegments.2", "match": {"value": "components"}},
    ], limit=2000)
    by_file: dict[str, list[dict]] = defaultdict(list)
    for pt in points:
        fp = pt["payload"].get("filePath", "")
        if fp.endswith(".tsx") or fp.endswith(".ts"):
            by_file[fp].append(pt)
    return dict(by_file)


def text_of(chunks: list[dict]) -> str:
    return "\n".join(c["payload"].get("codeChunk", "") for c in chunks)


# ── Gap checks ───────────────────────────────────────────────────────────────
class Findings:
    def __init__(self):
        self.sections: list[tuple[str, list[str]]] = []

    def section(self, title: str, items: list[str]):
        self.sections.append((title, items))

    def render(self) -> str:
        lines = []
        total_issues = 0
        for title, items in self.sections:
            lines.append(f"\n## {title}")
            if not items:
                lines.append("- ✅ No issues found.")
            else:
                total_issues += len(items)
                for i in items:
                    lines.append(f"- {i}")
        return f"**Total issues: {total_issues}**\n" + "\n".join(lines)


def check_local_auth_state(pages: dict[str, list[dict]]) -> list[str]:
    """Pages that manage user state locally instead of via useAuthStore."""
    issues = []
    # Also read from disk to get full file content (Qdrant chunks may be cut off)
    for fp, chunks in pages.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        # Skip auth pages — they legitimately call getUser before AuthStore is seeded
        auth_exclusions = {"LoginPage.tsx", "SignupPage.tsx", "OTPPage.tsx", "AuthCallbackPage.tsx"}
        if fname in auth_exclusions:
            continue

        # Try to read the full file from disk for accurate detection
        rel = fp.replace("\\", os.sep).replace("/", os.sep)
        abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), rel)
        if os.path.exists(abs_path):
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                code = fh.read()
        else:
            code = text_of(chunks)

        has_local_user = bool(re.search(r"useState[^;]*null[^;]*;.*user|const\s+\[user", code, re.IGNORECASE))
        has_setUser    = "setUser" in code and "authStore" not in code
        uses_get_user  = "supabase.auth.getUser" in code and "authStore" not in code
        has_authstore  = "useAuthStore" in code or "authStore" in code
        if (has_local_user or has_setUser or uses_get_user) and not has_authstore:
            signals = []
            if has_local_user:  signals.append("useState null for user")
            if has_setUser:     signals.append("setUser call")
            if uses_get_user:   signals.append("supabase.auth.getUser")
            issues.append(f"⚠️  **AUTH MISMATCH** `{fname}` — local auth state instead of `useAuthStore()`: {', '.join(signals)}")
    return issues


def check_raw_error_message(pages: dict[str, list[dict]], components: dict[str, list[dict]]) -> list[str]:
    """Files that expose error.message to users via toast or UI text."""
    issues = []
    all_files = {**pages, **components}
    pattern = re.compile(r"toast\.[a-z]+\s*\([^)]*error\.message|setText\([^)]*error\.message|setError\([^)]*error\.message", re.IGNORECASE)
    for fp, chunks in all_files.items():
        code = text_of(chunks)
        fname = fp.split("\\")[-1].split("/")[-1]
        if pattern.search(code):
            issues.append(f"🔴 **ERROR LEAK** `{fname}` — `error.message` exposed to user via toast/state")
    return issues


def check_supabase_error_handling(pages: dict[str, list[dict]], components: dict[str, list[dict]]) -> list[str]:
    """Files that call supabase but skip error handling."""
    issues = []
    all_files = {**pages, **components}
    for fp, chunks in all_files.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        # Read full file from disk for accuracy
        rel = fp.replace("\\", os.sep).replace("/", os.sep)
        abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), rel)
        if os.path.exists(abs_path):
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                code = fh.read()
        else:
            code = text_of(chunks)
        has_supabase = "supabase" in code and (".from(" in code or ".select(" in code or ".insert(" in code or ".update(" in code or ".delete(" in code)
        if not has_supabase:
            continue
        # Check for at least one error check (if statement, try/catch, or .catch)
        has_error_check = bool(
            re.search(r"if\s*\(\s*error\s*\)", code) or
            re.search(r"if\s*\(error\)", code) or
            re.search(r"catch\s*\(", code) or
            ".catch(" in code
        )
        if not has_error_check:
            issues.append(f"⚠️  **NO ERROR CHECK** `{fname}` — uses Supabase but no `if (error)` or try/catch guard found")
    return issues


def check_loading_state(pages: dict[str, list[dict]]) -> list[str]:
    """Pages that fetch data but show no loading skeleton/state."""
    issues = []
    for fp, chunks in pages.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        rel = fp.replace("\\", os.sep).replace("/", os.sep)
        abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), rel)
        if os.path.exists(abs_path):
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                code = fh.read()
        else:
            code = text_of(chunks)
        fetches = "supabase" in code and (".from(" in code or ".rpc(" in code)
        if not fetches:
            continue
        has_loading = bool(re.search(r"isLoading|loading\s*==|loading\s*===|Skeleton|spinner|Loading", code, re.IGNORECASE))
        if not has_loading:
            issues.append(f"⚠️  **NO LOADING STATE** `{fname}` — fetches data but no loading indicator pattern found")
    return issues


def check_bilingual(pages: dict[str, list[dict]], components: dict[str, list[dict]]) -> list[str]:
    """Files that show user-facing strings without bilingual support."""
    issues = []
    all_files = {**pages, **components}
    for fp, chunks in all_files.items():
        code = text_of(chunks)
        fname = fp.split("\\")[-1].split("/")[-1]
        # Has JSX with English text strings but no language toggle
        has_jsx_text = bool(re.search(r'>\s*[A-Z][a-z].*</[a-z]', code))
        has_bilingual = bool(re.search(r"language\s*===?\s*['\"]en['\"]|language\s*===?\s*['\"]hi['\"]|t\(|i18n", code))
        # Only flag components with meaningful user-facing content
        if has_jsx_text and not has_bilingual and len(code) > 500:
            issues.append(f"🟡 **NO BILINGUAL** `{fname}` — user-facing text found but no `language === 'en'` pattern")
    return issues


def check_missing_error_ui(pages: dict[str, list[dict]]) -> list[str]:
    """Pages that fetch data but have no error fallback UI."""
    issues = []
    for fp, chunks in pages.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        rel = fp.replace("\\", os.sep).replace("/", os.sep)
        abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), rel)
        if os.path.exists(abs_path):
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                code = fh.read()
        else:
            code = text_of(chunks)
        fetches = "supabase" in code
        if not fetches:
            continue
        has_error_ui = bool(re.search(r"loadError|fetchError|isError|error.*return|AlertCircle", code, re.IGNORECASE))
        if not has_error_ui:
            issues.append(f"⚠️  **NO ERROR UI** `{fname}` — Supabase usage with no error fallback/return UI")
    return issues


def check_any_type(pages: dict[str, list[dict]], components: dict[str, list[dict]]) -> list[str]:
    """Files with TypeScript `any` type annotations."""
    issues = []
    all_files = {**pages, **components}
    pat = re.compile(r":\s*any\b|<any>|as\s+any\b|Array<any>")
    for fp, chunks in all_files.items():
        code = text_of(chunks)
        fname = fp.split("\\")[-1].split("/")[-1]
        matches = pat.findall(code)
        if len(matches) >= 2:
            issues.append(f"🟡 **TYPESCRIPT `any`** `{fname}` — {len(matches)} occurrences of `any` type ({', '.join(set(matches[:4]))})")
    return issues


def check_console_log(pages: dict[str, list[dict]], components: dict[str, list[dict]]) -> list[str]:
    """Files with console.log statements that should be removed for production."""
    issues = []
    all_files = {**pages, **components}
    for fp, chunks in all_files.items():
        code = text_of(chunks)
        fname = fp.split("\\")[-1].split("/")[-1]
        matches = re.findall(r"console\.log\s*\(", code)
        if matches:
            issues.append(f"🟡 **CONSOLE.LOG** `{fname}` — {len(matches)} `console.log` call(s) in production code")
    return issues


# ── Semantic gap checks (use Qdrant search) ──────────────────────────────────
def semantic_check(label: str, good_query: str, bad_query: str, description: str) -> list[str]:
    """
    Search for anti-pattern code in the frontend using embeddings.
    bad_query should describe code that SHOULD NOT exist in production.
    """
    issues = []
    bad_vec = embed(bad_query)
    hits = search(bad_vec, file_filter=frontend_filter(), limit=8)
    if not hits:
        return []
    for h in hits:
        p = h.get("payload", {})
        fp = p.get("filePath", ""); sl = p.get("startLine", "?")
        fname = fp.split("\\")[-1].split("/")[-1]
        chunk = p.get("codeChunk", "").strip()[:200]
        score = h.get("score", 0)
        issues.append(f"[{score:.2f}] **{label}** `{fname}:{sl}` — {description}\n    ```\n    {chunk}\n    ```")
    return issues


def route_vs_page_audit(pages: dict[str, list[dict]]) -> list[str]:
    """Find page files that aren't referenced in App.tsx (reads actual file from disk)."""
    issues = []

    # Read App.tsx from disk for authoritative route list
    app_tsx_path = os.path.join(FRONTEND_SRC, "App.tsx")
    if os.path.exists(app_tsx_path):
        with open(app_tsx_path, encoding="utf-8") as fh:
            route_code = fh.read()
    else:
        # Fallback: Qdrant chunks for App.tsx
        pts = scroll_filter([
            {"key": "pathSegments.0", "match": {"value": "frontend"}},
            {"key": "pathSegments.1", "match": {"value": "src"}},
        ], limit=5000)
        route_code = "".join(
            pt["payload"].get("codeChunk", "")
            for pt in pts
            if "App.tsx" in pt["payload"].get("filePath", "")
        )

    # Components referenced in routes (element={<X> or import X from)
    components_in_routes = set(re.findall(r'element=\{<([A-Za-z]+)', route_code))
    components_in_routes.update(re.findall(r'import\s+([A-Za-z]+)\s+from', route_code))
    # Lazy imports: React.lazy(() => import('./pages/X'))
    components_in_routes.update(re.findall(r"import\('./pages/(?:[^']+/)?([A-Za-z0-9]+)'\)", route_code))
    # Also catch components used in RoleHome / inline renders
    components_in_routes.update(re.findall(r'<([A-Za-z][A-Za-z0-9]+)\s*/?>', route_code))

    # Page file stems — look in both pages/ and pages/*/
    page_basenames = set()
    for fp in pages.keys():
        stem = fp.split("\\")[-1].split("/")[-1].replace(".tsx", "").replace(".ts", "")
        page_basenames.add(stem)

    # Structural exclusions
    excluded = {"index", "Index", "Layout", "layout", "App", "main", "NotFound"}

    for stem in sorted(page_basenames):
        if stem in excluded:
            continue
        if stem not in components_in_routes:
            issues.append(f"🟡 **ORPHAN PAGE** `{stem}.tsx` — not imported or used in App.tsx")
    return issues


def store_usage_audit() -> list[str]:
    """Check which stores exist vs which are actually imported in frontend/src."""
    # Read store files from disk
    stores_dir = os.path.join(FRONTEND_SRC, "stores")
    if not os.path.isdir(stores_dir):
        return ["🟡 **STORE DIR NOT FOUND** `frontend/src/stores` not found on disk"]

    store_names = [
        f.replace(".ts", "").replace(".tsx", "")
        for f in os.listdir(stores_dir)
        if f.endswith((".ts", ".tsx")) and not f.startswith("_")
    ]

    # Scan all frontend/src .tsx/.ts/.js files for imports
    all_imports_code = ""
    for root, dirs, files in os.walk(FRONTEND_SRC):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "__pycache__")]
        for fn in files:
            if fn.endswith((".ts", ".tsx")):
                path = os.path.join(root, fn)
                try:
                    with open(path, encoding="utf-8", errors="ignore") as fh:
                        all_imports_code += fh.read(1024 * 50)  # first 50KB per file
                except OSError:
                    pass

    issues = []
    for store in sorted(store_names):
        if store not in all_imports_code:
            issues.append(f"🟡 **UNUSED STORE** `{store}` — store file exists but never imported anywhere in frontend/src")
    return issues


def migration_rls_audit() -> list[str]:
    """Check Supabase migration files for tables missing RLS ENABLE."""
    mig_points = scroll_filter([
        {"key": "pathSegments.0", "match": {"value": "supabase"}},
        {"key": "pathSegments.1", "match": {"value": "migrations"}},
    ], limit=1000)

    issues = []
    file_code: dict[str, str] = defaultdict(str)
    for pt in mig_points:
        fp = pt["payload"].get("filePath", "")
        file_code[fp] += pt["payload"].get("codeChunk", "") + "\n"

    for fp, code in file_code.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        # Find CREATE TABLE statements
        tables = re.findall(r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?([\w]+)", code, re.IGNORECASE)
        for tbl in tables:
            rls_enabled = f"ENABLE ROW LEVEL SECURITY" in code.upper() and tbl.lower() in code.lower()
            if not rls_enabled:
                issues.append(f"🔴 **MISSING RLS** `{fname}` — table `{tbl}` created without `ENABLE ROW LEVEL SECURITY`")
    return issues


def using_true_rls_audit() -> list[str]:
    """Check for USING (true) on user-owned tables — banned per SECURITY.md."""
    mig_points = scroll_filter([
        {"key": "pathSegments.0", "match": {"value": "supabase"}},
        {"key": "pathSegments.1", "match": {"value": "migrations"}},
    ], limit=1000)

    issues = []
    file_code: dict[str, str] = defaultdict(str)
    for pt in mig_points:
        fp = pt["payload"].get("filePath", "")
        file_code[fp] += pt["payload"].get("codeChunk", "") + "\n"

    for fp, code in file_code.items():
        fname = fp.split("\\")[-1].split("/")[-1]
        matches = re.findall(r"FOR\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+(?:TO\s+\w+\s+)?USING\s*\(\s*true\s*\)", code, re.IGNORECASE)
        if matches:
            issues.append(f"🔴 **RLS USING(true)** `{fname}` — {len(matches)} permissive `USING (true)` polic(ies) — violates SECURITY.md BUG-RLS pattern")
    return issues


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=== TruckOpti Qdrant Gap Audit ===")
    print(f"Collection: {COLLECTION}")
    print(f"Qdrant: {QDRANT_URL}  Ollama: {OLLAMA_URL}/{EMBED_MODEL}\n")

    F = Findings()

    print("📂 Scanning pages and components from Qdrant index...", flush=True)
    pages = scan_all_pages()
    components = scan_all_components()
    print(f"   {len(pages)} page files, {len(components)} component files indexed\n")

    # ── 1. Auth pattern mismatches ──────────────────────────────────────────
    print("🔐 Check 1: Auth pattern mismatches (local state vs authStore)...", flush=True)
    F.section("1. Auth Pattern Mismatches", check_local_auth_state(pages))

    # ── 2. Raw error.message exposure ──────────────────────────────────────
    print("🛑 Check 2: error.message exposed to users...", flush=True)
    F.section("2. Raw error.message Exposure to Users", check_raw_error_message(pages, components))

    # ── 3. Missing Supabase error handling ────────────────────────────────
    print("⚠️  Check 3: Supabase queries without error handling...", flush=True)
    F.section("3. Supabase Queries Without Error Check", check_supabase_error_handling(pages, components))

    # ── 4. Missing loading states ───────────────────────────────────────────
    print("⏳ Check 4: Data-fetching pages without loading state...", flush=True)
    F.section("4. Data-Fetching Pages Without Loading State", check_loading_state(pages))

    # ── 5. Missing error fallback UI ────────────────────────────────────────
    print("🖥️  Check 5: Pages with Supabase but no error UI...", flush=True)
    F.section("5. Pages Without Error Fallback UI", check_missing_error_ui(pages))

    # ── 6. Bilingual gaps ───────────────────────────────────────────────────
    print("🌐 Check 6: User-facing files without bilingual support...", flush=True)
    F.section("6. Missing Bilingual (EN/HI) Support", check_bilingual(pages, components))

    # ── 7. TypeScript `any` type ────────────────────────────────────────────
    print("📝 Check 7: TypeScript `any` usage...", flush=True)
    F.section("7. TypeScript `any` Type Usage", check_any_type(pages, components))

    # ── 8. Console.log in production ────────────────────────────────────────
    print("📢 Check 8: console.log in production code...", flush=True)
    F.section("8. console.log in Production Code", check_console_log(pages, components))

    # ── 9. Route vs page audit ──────────────────────────────────────────────
    print("🗺️  Check 9: Orphan pages not in router...", flush=True)
    F.section("9. Orphan Page Files (Not in Router)", route_vs_page_audit(pages))

    # ── 10. Store usage audit ───────────────────────────────────────────────
    print("🏪 Check 10: Unused Zustand stores...", flush=True)
    F.section("10. Unused Zustand Stores", store_usage_audit())

    # ── 11. RLS missing in migrations ──────────────────────────────────────
    print("🔒 Check 11: Migrations missing RLS ENABLE...", flush=True)
    F.section("11. Supabase Migrations Missing RLS ENABLE", migration_rls_audit())

    # ── 12. USING(true) RLS banned pattern ─────────────────────────────────
    print("🔒 Check 12: Banned USING(true) RLS policies...", flush=True)
    F.section("12. Banned USING(true) RLS Policies", using_true_rls_audit())

    # ── 13. Semantic: hardcoded credentials hunt ────────────────────────────
    print("🔑 Check 13: Semantic hunt for hardcoded secrets/credentials...", flush=True)
    secret_vec = embed("hardcoded password API key secret token credential string literal test123")
    secret_hits = search(secret_vec, file_filter=frontend_filter(), limit=10)
    secret_issues = []
    for h in secret_hits:
        p = h.get("payload", {})
        fp = p.get("filePath", ""); sl = p.get("startLine", "?")
        fname = fp.split("\\")[-1].split("/")[-1]
        chunk = p.get("codeChunk", "").strip()[:200]
        score = h.get("score", 0)
        # Filter: only flag if the chunk actually contains suspicious patterns
        if re.search(r"['\"][a-zA-Z0-9_\-]{8,}['\"]", chunk) and score > 0.72:
            secret_issues.append(f"[{score:.2f}] `{fname}:{sl}` — potential hardcoded value\n    ```\n    {chunk[:120]}\n    ```")
    F.section("13. Potential Hardcoded Secrets", secret_issues)

    # ── 14. Semantic: dead/zombie route components ───────────────────────────
    print("💀 Check 14: Semantic search for TODO/FIXME/stub code...", flush=True)
    todo_vec = embed("TODO FIXME stub not implemented placeholder mock fake")
    todo_hits = search(todo_vec, file_filter=frontend_filter(), limit=12)
    todo_issues = []
    for h in todo_hits:
        p = h.get("payload", {})
        fp = p.get("filePath", ""); sl = p.get("startLine", "?")
        fname = fp.split("\\")[-1].split("/")[-1]
        chunk = p.get("codeChunk", "").strip()
        # Only flag if chunk contains explicit TODO/FIXME/stub
        if re.search(r"\bTODO\b|\bFIXME\b|\bHACK\b|\bstub\b|\bplaceholder\b|\bnot implemented\b", chunk, re.IGNORECASE):
            todo_issues.append(f"[{h.get('score',0):.2f}] `{fname}:{sl}`\n    ```\n    {chunk[:150]}\n    ```")
    F.section("14. TODO / FIXME / Stub Code", todo_issues)

    # ── 15. Semantic: direct DOM manipulation / non-React patterns ──────────
    print("⚛️  Check 15: Semantic search for non-React anti-patterns...", flush=True)
    dom_vec = embed("document.getElementById querySelector innerHTML DOM manipulation direct")
    dom_hits = search(dom_vec, file_filter=frontend_filter(), limit=8)
    dom_issues = []
    for h in dom_hits:
        p = h.get("payload", {})
        fp = p.get("filePath", ""); sl = p.get("startLine", "?")
        fname = fp.split("\\")[-1].split("/")[-1]
        chunk = p.get("codeChunk", "").strip()
        if re.search(r"document\.|\.innerHTML|\.getElementById|querySelector", chunk):
            dom_issues.append(f"[{h.get('score',0):.2f}] `{fname}:{sl}`\n    ```\n    {chunk[:150]}\n    ```")
    F.section("15. Direct DOM Manipulation (Non-React)", dom_issues)

    # ── 16. Semantic: missing form validation ───────────────────────────────
    print("📋 Check 16: Semantic search for forms without validation...", flush=True)
    form_vec = embed("form onSubmit handleSubmit input submit button user input no validation")
    form_hits = search(form_vec, file_filter=frontend_filter(), limit=10)
    unvalidated = []
    for h in form_hits:
        p = h.get("payload", {})
        fp = p.get("filePath", ""); sl = p.get("startLine", "?")
        fname = fp.split("\\")[-1].split("/")[-1]
        chunk = p.get("codeChunk", "").strip()
        # Has form submit but no zod/yup/validation
        has_submit = re.search(r"onSubmit|handleSubmit", chunk)
        no_validation = not re.search(r"zod|z\.|yup|\.parse\(|\.safeParse\(|required|minLength|validate", chunk, re.IGNORECASE)
        if has_submit and no_validation:
            unvalidated.append(f"[{h.get('score',0):.2f}] `{fname}:{sl}` — form submit without visible Zod/validation\n    ```\n    {chunk[:130]}\n    ```")
    F.section("16. Forms Without Validation", unvalidated)

    # ── Build report ────────────────────────────────────────────────────────
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    report = f"""# TruckOpti Qdrant Codebase Gap & Mismatch Audit
Generated: {now}
Collection: `{COLLECTION}` (Roo Code index, {QDRANT_URL})
Embedding model: `{EMBED_MODEL}` ({OLLAMA_URL})

> This report was produced by semantically querying the live Qdrant codebase index
> with {len(pages)} page files and {len(components)} component files scanned.
> Checks combine structural pattern matching on code chunks + vector similarity search.

{F.render()}

---
*Re-run: `python tools/qdrant_gap_audit.py`*
"""

    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        fh.write(report)

    print(f"\n✅ Report written → {REPORT_PATH}")

    # Print summary to stdout
    print("\n=== SUMMARY ===")
    total = 0
    for title, items in F.sections:
        count = len(items)
        total += count
        status = "✅" if count == 0 else f"❌ {count}"
        print(f"  {status}  {title}")
    print(f"\n  Total issues: {total}")


if __name__ == "__main__":
    main()
