"""TruckOpti smoke test — Playwright async API.

Runs all 5 phases from opencode-prompt.md against https://truckopti.in/.
Captures screenshots, console errors, network status, and emits a JSON result
file that the report-generator reads.
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

# Force UTF-8 stdout on Windows so non-ASCII (₹, etc.) doesn't crash prints.
for _stream_name in ("stdout", "stderr"):
    _stream = getattr(sys, _stream_name, None)
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

from playwright.async_api import async_playwright, Page, Response, ConsoleMessage

BASE = "https://truckopti.in"
SCREENSHOT_DIR = Path(r"D:\Github\Truck_Opti\webwright-test\screenshots")
RESULTS_PATH = Path(r"D:\Github\Truck_Opti\webwright-test\test-results.json")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

results: list[dict] = []


def record(test_id: str, label: str, status: str, **fields) -> None:
    entry = {"id": test_id, "label": label, "status": status, **fields}
    results.append(entry)
    print(f"[{status}] {test_id}: {label}", flush=True)
    for k, v in fields.items():
        if k in ("console_errors", "console_warnings", "findings", "notes"):
            print(f"    {k}: {v}", flush=True)


async def capture_console(page: Page) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    def on_console(msg: ConsoleMessage) -> None:
        if msg.type == "error":
            errors.append(msg.text)
        elif msg.type == "warning":
            warnings.append(msg.text)

    page.on("console", on_console)
    return errors, warnings


async def goto_safe(page: Page, path: str) -> tuple[int | None, str, str | None]:
    """Visit a URL, return (http_status, final_url, failure_reason)."""
    url = f"{BASE}{path}"
    failure = None
    status = None
    final_url = ""
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        final_url = page.url
        if response is not None:
            status = response.status
        # Allow late resources to settle a bit
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
    except Exception as e:
        failure = f"{type(e).__name__}: {e}"
    return status, final_url, failure


async def title(page: Page) -> str:
    try:
        return await page.title()
    except Exception:
        return ""


async def shot(page: Page, name: str) -> str:
    p = SCREENSHOT_DIR / name
    try:
        await page.screenshot(path=str(p), full_page=True)
        return str(p)
    except Exception as e:
        print(f"    screenshot failed for {name}: {e}", flush=True)
        return ""


# ----------------------- PHASE 1 -----------------------

async def phase1(ctx) -> None:
    print("\n===== PHASE 1: Homepage and Static Pages =====", flush=True)

    # 1. Homepage
    page = await ctx.new_page()
    errors, warnings = await capture_console(page)
    status, final, fail = await goto_safe(page, "/")
    page_title = await title(page)
    body_text = ""
    has_hero = False
    has_nav = False
    cta_count = 0
    try:
        body_text = (await page.inner_text("body"))[:2000]
        has_hero = await page.locator("text=/TruckOpti|truck|logistics|fleet|smart/i").count() > 0
        has_nav = await page.locator("nav, header").count() > 0
        cta_count = await page.locator("a, button").filter(has_text=re.compile(r"get started|sign up|start|book|demo|free|try", re.I)).count()
    except Exception as e:
        print(f"    homepage DOM probe failed: {e}", flush=True)
    screenshot = await shot(page, "01_homepage.png")
    record(
        "1.1", "Homepage loads", "PASS" if (status and status < 400 and not fail) else "FAIL",
        url=final, http_status=status, page_title=page_title,
        has_hero_text=has_hero, has_nav=has_nav, cta_count=cta_count,
        body_snippet=body_text[:500], screenshot=screenshot,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 2. Pricing + toggle
    page = await ctx.new_page()
    errors, warnings = await capture_console(page)
    status, final, fail = await goto_safe(page, "/pricing")
    page_title = await title(page)
    body_text = ""
    price_cards = 0
    prices_before = []
    prices_after = []
    toggle_clicked = False
    try:
        body_text = (await page.inner_text("body"))[:3000]
        price_cards = await page.locator(":text-matches(r'\\\\$|₹|USD|inr|month|year', 'i')").count()
        # Capture visible prices before toggle
        price_loc = page.locator("text=/₹|Rs\\.|\\$\\d/").all()
        before = await page.locator("text=/\\$\\d|₹\\d/").all_text_contents()
        prices_before = before
        # Try clicking a toggle
        toggle_candidates = [
            'button:has-text("Yearly")',
            'button:has-text("Year")',
            'button:has-text("Annual")',
            'button:has-text("Monthly")',
            '[role="tab"]',
            'label:has-text("Yearly")',
        ]
        for sel in toggle_candidates:
            loc = page.locator(sel)
            if await loc.count() > 0:
                try:
                    await loc.first.click(timeout=2000)
                    toggle_clicked = True
                    await page.wait_for_timeout(800)
                    break
                except Exception:
                    continue
        after = await page.locator("text=/\\$\\d|₹\\d/").all_text_contents()
        prices_after = after
    except Exception as e:
        print(f"    pricing probe failed: {e}", flush=True)
    screenshot = await shot(page, "02_pricing.png")
    record(
        "1.2", "/pricing renders + toggle works", "PASS" if (status and status < 400) else "FAIL",
        url=final, http_status=status, page_title=page_title,
        price_cards=price_cards, toggle_clicked=toggle_clicked,
        prices_before=prices_before[:6], prices_after=prices_after[:6],
        price_changed=prices_before != prices_after,
        body_snippet=body_text[:500], screenshot=screenshot,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 3. Contact + empty submit
    page = await ctx.new_page()
    errors, warnings = await capture_console(page)
    status, final, fail = await goto_safe(page, "/contact")
    page_title = await title(page)
    name_field = email_field = msg_field = submit_btn = False
    validation_msg = ""
    try:
        name_field = await page.locator('input[name="name"], input[placeholder*="ame" i]').count() > 0
        email_field = await page.locator('input[type="email"], input[name="email"]').count() > 0
        msg_field = await page.locator('textarea').count() > 0
        submit_btn = await page.locator('button[type="submit"]').count() > 0
        if submit_btn:
            btn = page.locator('button[type="submit"]').first
            try:
                await btn.click(timeout=3000)
                await page.wait_for_timeout(1500)
                # Look for validation
                validation_msg = await page.locator(
                    'text=/required|please fill|enter your|invalid/i'
                ).first.text_content() or ""
            except Exception as e:
                print(f"    contact submit click failed: {e}", flush=True)
    except Exception as e:
        print(f"    contact probe failed: {e}", flush=True)
    screenshot = await shot(page, "03_contact.png")
    record(
        "1.3", "/contact form + validation", "PASS" if (status and status < 400 and name_field) else "FAIL",
        url=final, http_status=status, page_title=page_title,
        has_name=name_field, has_email=email_field, has_message=msg_field, has_submit=submit_btn,
        validation_msg=validation_msg[:200], screenshot=screenshot,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 4. Terms
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    status, final, fail = await goto_safe(page, "/terms")
    page_title = await title(page)
    content_len = 0
    try:
        content_len = len(await page.inner_text("body"))
    except Exception:
        pass
    record(
        "1.4", "/terms loads", "PASS" if (status and status < 400 and content_len > 200) else "FAIL",
        url=final, http_status=status, page_title=page_title, content_length=content_len,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 5. Privacy
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    status, final, fail = await goto_safe(page, "/privacy")
    page_title = await title(page)
    content_len = 0
    try:
        content_len = len(await page.inner_text("body"))
    except Exception:
        pass
    record(
        "1.5", "/privacy loads", "PASS" if (status and status < 400 and content_len > 200) else "FAIL",
        url=final, http_status=status, page_title=page_title, content_length=content_len,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()


# ----------------------- PHASE 2 -----------------------

async def phase2(ctx) -> None:
    print("\n===== PHASE 2: Authentication Pages =====", flush=True)

    targets = [
        ("2.1", "/login?mode=driver", "Driver login"),
        ("2.2", "/login?mode=agency", "Agency login"),
    ]
    for tid, path, expected in targets:
        page = await ctx.new_page()
        errors, _ = await capture_console(page)
        status, final, fail = await goto_safe(page, path)
        page_title = await title(page)
        body_text = ""
        has_email = has_google = has_submit = False
        driver_signals = agency_signals = False
        try:
            body_text = (await page.inner_text("body"))[:2500]
            has_email = await page.locator('input[type="email"], input[name="email"]').count() > 0
            has_google = await page.locator(
                'button:has-text("Google"), a:has-text("Google"), [aria-label*="Google" i]'
            ).count() > 0
            has_submit = await page.locator('button[type="submit"]').count() > 0
            low = body_text.lower()
            driver_signals = "driver" in low
            agency_signals = "agency" in low
        except Exception:
            pass
        screenshot = await shot(page, f"{tid.replace('.', '_')}_login.png")
        role_specific_title = (
            (tid.startswith("2.1") and "driver" in page_title.lower())
            or (tid.startswith("2.2") and "agency" in page_title.lower())
        )
        record(
            tid, f"{expected} form renders (OTP or password)",
            "PASS" if (status and status < 400 and has_email and has_submit) else "FAIL",
            url=final, http_status=status, page_title=page_title,
            has_email=has_email, has_google_btn=has_google, has_submit=has_submit,
            driver_signals=driver_signals, agency_signals=agency_signals,
            role_specific_title=role_specific_title,
            body_snippet=body_text[:400],
            screenshot=screenshot, console_errors=errors[:10], failure=fail,
        )
        await page.close()

    # 2.3 Signup
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    status, final, fail = await goto_safe(page, "/signup")
    page_title = await title(page)
    body_text = ""
    has_email = has_google = has_submit = has_name = False
    try:
        body_text = (await page.inner_text("body"))[:2500]
        has_email = await page.locator('input[type="email"], input[name="email"]').count() > 0
        has_google = await page.locator(
            'button:has-text("Google"), a:has-text("Google")'
        ).count() > 0
        has_submit = await page.locator('button[type="submit"]').count() > 0
        has_name = await page.locator('input[name="name"], input[placeholder*="ame" i]').count() > 0
    except Exception:
        pass
    screenshot = await shot(page, "23_signup.png")
    record(
        "2.3", "/signup form renders", "PASS" if (status and status < 400 and has_email and has_submit) else "FAIL",
        url=final, http_status=status, page_title=page_title,
        has_email=has_email, has_name=has_name, has_google_btn=has_google, has_submit=has_submit,
        body_snippet=body_text[:400], screenshot=screenshot,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 2.4 Forgot password
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    status, final, fail = await goto_safe(page, "/forgot-password")
    page_title = await title(page)
    body_text = ""
    has_identifier = has_submit = False
    try:
        body_text = (await page.inner_text("body"))[:1500]
        # App uses "Email or Login ID" — accept email-typed or text-typed identifier
        has_identifier = await page.locator(
            'input[type="email"], input[name="email"], input[type="text"], input:not([type])'
        ).count() > 0
        has_submit = await page.locator('button[type="submit"]').count() > 0
    except Exception:
        pass
    record(
        "2.4", "/forgot-password form renders", "PASS" if (status and status < 400 and has_identifier and has_submit) else "FAIL",
        url=final, http_status=status, page_title=page_title,
        has_identifier_field=has_identifier, has_submit=has_submit,
        body_snippet=body_text[:400], screenshot=await shot(page, "24_forgot.png"),
        console_errors=errors[:10], failure=fail,
    )
    await page.close()


# ----------------------- PHASE 3 -----------------------

async def phase3(ctx) -> None:
    print("\n===== PHASE 3: Role Registration (Dead-end check) =====", flush=True)

    targets = [
        ("3.1", "/driver/register", "Driver register"),
        ("3.2", "/agency/register", "Agency register"),
    ]
    for tid, path, expected in targets:
        page = await ctx.new_page()
        errors, _ = await capture_console(page)
        nav_chain: list[str] = []
        page.on("framenavigated", lambda f, c=nav_chain: c.append(f.url) if f == page.main_frame else None)
        status, final, fail = await goto_safe(page, path)
        page_title = await title(page)
        body_text = ""
        has_signup_link = has_login_link = has_google = False
        signup_link_href = login_link_href = ""
        try:
            body_text = (await page.inner_text("body"))[:3000]
            # Look for sign-up / create-account links
            su = page.locator('a:has-text("Sign up"), a:has-text("Create account"), a:has-text("Register"), a:has-text("Get started")')
            if await su.count() > 0:
                signup_link_href = await su.first.get_attribute("href") or ""
                has_signup_link = True
            lu = page.locator('a:has-text("Login"), a:has-text("Log in"), a:has-text("Sign in")')
            if await lu.count() > 0:
                login_link_href = await lu.first.get_attribute("href") or ""
                has_login_link = True
            has_google = await page.locator(
                'button:has-text("Google"), :text-matches("google", "i")'
            ).count() > 0
        except Exception as e:
            print(f"    {tid} probe error: {e}", flush=True)
        screenshot = await shot(page, f"{tid.replace('.', '_')}_register.png")
        redirected = (final.rstrip("/") != f"{BASE}{path}")
        record(
            tid, f"{expected} — reachable from anonymous user?",
            "PASS" if (status and status < 400 and not redirected and body_text and not has_signup_link) else "FAIL",
            url=final, http_status=status, page_title=page_title,
            redirected=redirected, nav_chain=nav_chain[:5],
            has_signup_link=has_signup_link, signup_link_href=signup_link_href,
            has_login_link=has_login_link, login_link_href=login_link_href,
            has_google_btn=has_google,
            title_specific=page_title not in ("TruckOpti - Smart Logistics", "TruckOpti", ""),
            body_snippet=body_text[:500], screenshot=screenshot,
            console_errors=errors[:10], failure=fail,
        )
        await page.close()

    # 3.3 — Can a new user reach a signup flow from /driver/register?
    # Already covered in 3.1/3.2 has_signup_link flags.
    record(
        "3.3", "New-user signup path reachable from /driver/register",
        "PASS" if any(r["id"] == "3.1" and r.get("has_signup_link") for r in results) else "FAIL",
        notes="Derived from 3.1 has_signup_link flag",
    )

    # 3.4 — Title consistency
    title_31 = next((r.get("page_title") for r in results if r["id"] == "3.1"), None)
    record(
        "3.4", "/driver/register browser title is specific (not generic)",
        "PASS" if title_31 and title_31 not in ("TruckOpti - Smart Logistics", "TruckOpti", "") else "FAIL",
        page_title=title_31, notes="Generic title indicates a dead-end / fallback page",
    )


# ----------------------- PHASE 4 -----------------------

async def phase4(ctx) -> None:
    print("\n===== PHASE 4: Navigation and Cross-links =====", flush=True)

    # 4.1 — Click Login on homepage
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    status, final, fail = await goto_safe(page, "/")
    login_href = ""
    login_target = ""
    try:
        loc = page.locator('a:has-text("Login"), a:has-text("Log in"), button:has-text("Login")')
        if await loc.count() > 0:
            login_href = await loc.first.get_attribute("href") or ""
            try:
                tag = await loc.first.evaluate("el => el.tagName")
                login_target = f"<{tag.lower()} href='{login_href}'>"
            except Exception:
                pass
        # Try to click and observe destination
        if await loc.count() > 0:
            await loc.first.click(timeout=3000)
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
    except Exception as e:
        print(f"    login click failed: {e}", flush=True)
    after_click_url = page.url
    record(
        "4.1", "Homepage Login button target",
        "PASS" if "login" in after_click_url.lower() else "FAIL",
        href=login_href, target=login_target, after_click_url=after_click_url,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()

    # 4.2 — Click Signup on homepage
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    await goto_safe(page, "/")
    signup_href = ""
    signup_target = ""
    after_click_url = ""
    try:
        loc = page.locator('a:has-text("Sign up"), a:has-text("Signup"), a:has-text("Get started"), button:has-text("Sign up")')
        if await loc.count() > 0:
            signup_href = await loc.first.get_attribute("href") or ""
            tag = await loc.first.evaluate("el => el.tagName")
            signup_target = f"<{tag.lower()} href='{signup_href}'>"
            await loc.first.click(timeout=3000)
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
    except Exception as e:
        print(f"    signup click failed: {e}", flush=True)
    after_click_url = page.url
    record(
        "4.2", "Homepage Signup link target",
        "PASS" if "signup" in after_click_url.lower() or "register" in after_click_url.lower() else "FAIL",
        href=signup_href, target=signup_target, after_click_url=after_click_url,
        console_errors=errors[:10],
    )
    await page.close()

    # 4.3 — Google sign-in launches OAuth (do NOT complete)
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    await goto_safe(page, "/login")
    google_btn_count = 0
    oauth_url = ""
    try:
        gbtn = page.locator('button:has-text("Google"), a:has-text("Google"), :text-matches("continue with google", "i")')
        google_btn_count = await gbtn.count()
        if google_btn_count > 0:
            async with page.expect_navigation(wait_until="domcontentloaded", timeout=5000) as nav:
                try:
                    await gbtn.first.click(timeout=2000)
                except Exception as e:
                    print(f"    google click did not navigate: {e}", flush=True)
            nav_value = await nav.value
            if nav_value is not None:
                oauth_url = nav_value.url
            else:
                oauth_url = page.url
    except Exception as e:
        print(f"    google oauth probe exception: {e}", flush=True)
        oauth_url = page.url
    # Detect accountchooser / OAuth host
    is_oauth = bool(re.search(r"accounts\.google\.com|oauth|googleapis|signin", oauth_url, re.I))
    record(
        "4.3", "Google sign-in button launches OAuth flow",
        "PASS" if (google_btn_count > 0 and (is_oauth or oauth_url != f"{BASE}/login")) else "FAIL",
        google_button_present=google_btn_count > 0,
        post_click_url=oauth_url, looks_like_oauth=is_oauth,
        console_errors=errors[:10],
    )
    await page.close()

    # 4.4 — Mobile responsive screenshot
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    try:
        await page.set_viewport_size({"width": 375, "height": 812})
    except Exception:
        pass
    status, final, fail = await goto_safe(page, "/")
    screenshot = await shot(page, "04_homepage_mobile_375x812.png")
    record(
        "4.4", "Homepage renders at 375x812 (mobile)", "PASS" if (status and status < 400) else "FAIL",
        url=final, http_status=status, screenshot=screenshot,
        console_errors=errors[:10], failure=fail,
    )
    await page.close()


# ----------------------- PHASE 5 -----------------------

async def phase5(ctx) -> None:
    print("\n===== PHASE 5: Form Validation =====", flush=True)

    # 5.1 — Empty login submit
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    await goto_safe(page, "/login")
    pre_url = page.url
    btn_state = ""
    validation_text = ""
    try:
        btn = page.locator('button[type="submit"]').first
        is_disabled = await btn.is_disabled()
        btn_state = f"disabled={is_disabled}"
        if not is_disabled:
            await btn.click(timeout=3000)
            await page.wait_for_timeout(1500)
        # Race-safe text read: only wait briefly
        try:
            validation_text = await page.locator(
                'text=/required|please|enter|invalid/i'
            ).first.text_content(timeout=2000) or ""
        except Exception:
            validation_text = ""
    except Exception as e:
        print(f"    5.1 click error: {e}", flush=True)
    record(
        "5.1", "Empty /login submission blocked or validated",
        "PASS" if (btn_state.startswith("disabled=True") or validation_text or page.url == pre_url) else "FAIL",
        url_before=pre_url, url_after=page.url, button_state=btn_state,
        validation_msg=validation_text[:200], console_errors=errors[:10],
    )
    await page.close()

    # 5.2 — Invalid email on /signup
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    await goto_safe(page, "/signup")
    validation = ""
    try:
        email_input = page.locator('input[type="email"], input[name="email"]').first
        await email_input.fill("not-an-email", timeout=3000)
        # Try to submit
        btn = page.locator('button[type="submit"]').first
        if await btn.count() > 0 and not await btn.is_disabled():
            await btn.click(timeout=3000)
            await page.wait_for_timeout(1500)
        # Read native HTML5 validation
        validation = await email_input.evaluate("el => el.validationMessage") or ""
        if not validation:
            validation = await page.locator(
                'text=/invalid|valid email|email format/i'
            ).first.text_content() or ""
    except Exception as e:
        print(f"    5.2 error: {e}", flush=True)
    record(
        "5.2", "/signup rejects invalid email",
        "PASS" if validation else "FAIL",
        validation_msg=validation[:200], console_errors=errors[:10],
    )
    await page.close()

    # 5.3 — Partial contact fill
    page = await ctx.new_page()
    errors, _ = await capture_console(page)
    await goto_safe(page, "/contact")
    validation = ""
    try:
        # Fill only one field
        name_input = page.locator('input[name="name"]').first
        if await name_input.count() > 0:
            await name_input.fill("Test User")
        # Try submit
        btn = page.locator('button[type="submit"]').first
        if await btn.count() > 0 and not await btn.is_disabled():
            await btn.click(timeout=3000)
            await page.wait_for_timeout(1500)
        validation = await page.locator(
            'text=/required|please fill|enter your|invalid|valid email/i'
        ).first.text_content() or ""
    except Exception as e:
        print(f"    5.3 error: {e}", flush=True)
    record(
        "5.3", "/contact partial fill → validation message",
        "PASS" if validation else "FAIL",
        validation_msg=validation[:200], console_errors=errors[:10],
    )
    await page.close()


# ----------------------- MAIN -----------------------

async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent="TruckOpti-SmokeTest/1.0 (Playwright)",
        )
        try:
            await phase1(ctx)
            await phase2(ctx)
            await phase3(ctx)
            await phase4(ctx)
            await phase5(ctx)
        finally:
            await ctx.close()
            await browser.close()

    RESULTS_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nResults written to {RESULTS_PATH}", flush=True)
    pass_n = sum(1 for r in results if r["status"] == "PASS")
    fail_n = sum(1 for r in results if r["status"] == "FAIL")
    print(f"SUMMARY: {pass_n} PASS, {fail_n} FAIL, {len(results)} total", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"FATAL: {e}", flush=True)
        sys.exit(1)
