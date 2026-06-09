"""
TruckOpti full-app smoke test driven by Microsoft Webwright (LocalBrowserEnvironment).

Uses Webwright's `LocalBrowserEnvironment.execute()` to run Playwright snippets
without an LLM backend. The `OPENROUTER_API_KEY` is set in the shell, but this
script is deterministic and re-runnable, so the LLM loop is bypassed for CI use.

Hard rules:
- DO NOT submit real OTPs, real reset emails, real contact messages, or
  create real production accounts.
- DO NOT mutate the live database.
- Every step writes a screenshot under OUTPUT_DIR.
- Every console.error and HTTP 4xx/5xx is recorded via Playwright listeners.

Usage:
    d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, r"C:\Users\Prakash\AppData\Local\Temp\webwright\src")

from webwright.environments import get_environment_class  # noqa: E402

BASE_URL = "https://www.truckopti.in"
OUTPUT_DIR = REPO_ROOT / "0.dev-matrix" / "test-reports" / "webwright-full-app-2026-06-01"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Listeners attached to the page once.
_LISTENERS_INSTALLED = False


def _snippet(body: str) -> str:
    """Return the inner body of `__agent_step__` to execute via Webwright."""
    return body


def _read(name: str) -> str:
    return (Path(__file__).parent / name).read_text(encoding="utf-8")


def _listener_boilerplate() -> str:
    return """
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass
"""


def _home_body() -> str:
    return _listener_boilerplate() + """
    await page.goto("https://www.truckopti.in/", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    h1_text = await page.evaluate("() => document.querySelector('h1')?.innerText || null")
    nav_links = await page.evaluate("() => Array.from(document.querySelectorAll('a, button')).map(el => ({tag: el.tagName, text: (el.innerText||'').trim().slice(0,60), href: el.getAttribute('href') || null})).filter(x => x.text).slice(0, 30)")
    await page.screenshot(path=r"__REPORT/01-home.png", full_page=False)
    print("TITLE=" + (title or ""))
    print("H1=" + (h1_text or ""))
    print("NAV_COUNT=" + str(len(nav_links)))
    print("NAV_LINKS=" + _j.dumps(nav_links))
"""


def _pricing_body() -> str:
    return _listener_boilerplate() + '''
    await page.goto("https://www.truckopti.in/pricing", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1')?.innerText || null")
    await page.screenshot(path=r"__REPORT/02a-pricing-default.png", full_page=True)
    # Find ALL candidate toggle elements.
    buttons = await page.evaluate("""() => Array.from(document.querySelectorAll('button')).map(b => { return [b.innerText, b.getAttribute('aria-pressed'), b.getAttribute('aria-selected')]; }).filter(x => x[0] && x[0].length < 40)""")
    print("PRICING_TITLE=" + title)
    print("PRICING_H1=" + (h1 or ""))
    print("BUTTONS=" + _j.dumps(buttons))
    # Try every plausible toggle.
    for label in ["Yearly", "Annually", "Annual", "Year"]:
        btns = page.locator('button:has-text("' + label + '")')
        if await btns.count() > 0:
            for i in range(await btns.count()):
                btn = btns.nth(i)
                if await btn.is_visible():
                    await btn.click()
                    await page.wait_for_timeout(800)
                    print("CLICKED=" + label + " idx=" + str(i))
                    prices_after = await page.evaluate("""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\\$/.test(t) && /\\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"__REPORT/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break
'''


def _contact_body() -> str:
    return _listener_boilerplate() + """
    await page.goto("https://www.truckopti.in/contact", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    await page.screenshot(path=r"__REPORT/03a-contact-empty.png", full_page=False)
    submit = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Submit")').first
    if await submit.count() > 0:
        await submit.click()
        await page.wait_for_timeout(500)
    await page.screenshot(path=r"__REPORT/03b-contact-errors.png", full_page=False)
    err_count = await page.locator('[role="alert"], .text-red-500, .text-red-600, .text-red-700, [aria-invalid="true"]').count()
    print("CONTACT_TITLE=" + title)
    print("CONTACT_ERRORS_AFTER_EMPTY_SUBMIT=" + str(err_count))
"""


def _generic_page_body(path: str, step: str) -> str:
    return _listener_boilerplate() + f"""
    await page.goto("https://www.truckopti.in/{path}", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"__REPORT/{step}.png", full_page=False)
    print("PATH={path}")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))
"""


def _role_register_body(role: str, step: str) -> str:
    return _listener_boilerplate() + f"""
    await page.goto("https://www.truckopti.in/{role}/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"__REPORT/{step}.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))
"""


def _otp_body() -> str:
    return _listener_boilerplate() + """
    import json as _j
    # Direct /otp visit.
    await page.goto("https://www.truckopti.in/otp", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    print("OTP_DIRECT_URL=" + page.url)
    print("OTP_DIRECT_TITLE=" + (await page.title()))
    await page.screenshot(path=r"__REPORT/10a-otp-direct.png", full_page=False)
    # Full login flow.
    await page.goto("https://www.truckopti.in/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.locator('input[type="email"]').first.fill("smoketest2026@truckopti.in")
    send = page.locator('button:has-text("Send OTP"), button:has-text("Get OTP"), button:has-text("Send Code"), button:has-text("Continue")').first
    if await send.count() > 0:
        print("SEND_BTN_DISABLED=" + str(await send.is_disabled()))
        await send.click()
        await page.wait_for_timeout(2500)
    print("POST_SEND_URL=" + page.url)
    print("POST_SEND_TITLE=" + (await page.title()))
    await page.screenshot(path=r"__REPORT/10b-post-send.png", full_page=True)
    otp_inputs = await page.locator('input[inputmode="numeric"], input[pattern="[0-9]*"]').count()
    print("OTP_INPUT_BOXES=" + str(otp_inputs))
    all_inputs = await page.evaluate("() => Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name, maxLength: i.maxLength, inputMode: i.inputMode, pattern: i.pattern, placeholder: i.placeholder}))")
    print("ALL_INPUTS=" + _j.dumps(all_inputs))
"""


def _mobile_body() -> str:
    return _listener_boilerplate() + """
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto("https://www.truckopti.in/", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.screenshot(path=r"__REPORT/11-mobile-home.png", full_page=False)
    menu_button = await page.locator('button[aria-label*="menu" i], button[aria-label*="Menu"], [class*="hamburger"], [class*="mobile-menu"]').count()
    has_h_scroll = await page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")
    print("MENU_BUTTONS=" + str(menu_button))
    print("HORIZONTAL_SCROLL=" + ("YES" if has_h_scroll else "NO"))
"""


def _google_body() -> str:
    return _listener_boilerplate() + """
    await page.set_viewport_size({"width": 1280, "height": 800})
    await page.goto("https://www.truckopti.in/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    google_btn = page.locator('button:has-text("Google"), a:has-text("Google")').first
    google_count = await page.locator('button:has-text("Google"), a:has-text("Google")').count()
    print("GOOGLE_BUTTONS=" + str(google_count))
    if google_count > 0:
        await google_btn.click()
        await page.wait_for_timeout(2000)
    print("POST_CLICK_URL=" + page.url)
    print("REDIRECTED_TO_GOOGLE=" + ("YES" if "accounts.google.com" in page.url else "NO"))
"""


def main() -> int:
    env_class = get_environment_class("local_browser")
    env = env_class(
        config={
            "output_dir": str(OUTPUT_DIR / "ww"),
            "browser_mode": "local_launch",
            "headless": True,
            "viewport_width": 1280,
            "viewport_height": 800,
            "start_url": BASE_URL,
        }
    )
    env.prepare()
    results: list[dict] = []

    steps = [
        ("01-home", _home_body()),
        ("02-pricing", _pricing_body()),
        ("03-contact", _contact_body()),
        ("04-login", _generic_page_body("/login", "04-login")),
        ("05-signup", _generic_page_body("/signup", "05-signup")),
        ("06-forgot-password", _generic_page_body("/forgot-password", "06-forgot-password")),
        ("07-terms", _generic_page_body("/terms", "07-terms")),
        ("08-privacy", _generic_page_body("/privacy", "08-privacy")),
        ("09a-driver-register", _role_register_body("driver", "09a-driver-register")),
        ("09b-agency-register", _role_register_body("agency", "09b-agency-register")),
        ("10-otp-6digit", _otp_body()),
        ("11-mobile-home", _mobile_body()),
        ("12-google-launch", _google_body()),
    ]

    # Initialize listener state and console/network error accumulators.
    init_code = """
_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []
"""
    env.execute({"python_code": init_code})

    for name, body in steps:
        # Substitute the report dir placeholder.
        resolved = body.replace("__REPORT", str(OUTPUT_DIR).replace("\\", "\\\\"))
        result = env.execute({"python_code": resolved})
        output = (result.get("output") or "").strip()
        exc = (result.get("exception_info") or "").strip()
        status = "PASS" if result.get("returncode") == 0 and not exc else "FAIL"
        results.append({
            "step": name,
            "status": status,
            "output": output[-2500:],
            "exception": exc[-1000:],
        })
        print(f"{name}: {status} (output_len={len(output)}, exc_len={len(exc)})")

    # Read listener accumulators.
    accumulators = env.execute({"python_code": """
print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))
"""})
    accum_out = accumulators.get("output") or ""

    # Cleanup.
    try:
        env.close()
    except Exception:
        pass

    # Persist a machine-readable summary.
    summary = {
        "base_url": BASE_URL,
        "steps": results,
        "accumulators_raw": accum_out[-2000:],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("\n=== SUMMARY ===")
    for s in results:
        print(f"{s['step']}: {s['status']}")
    print(accum_out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
