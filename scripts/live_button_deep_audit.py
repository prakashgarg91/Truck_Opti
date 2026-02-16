#!/usr/bin/env python3
import json
import random
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "https://truck-opti-app-efabf95bd306.herokuapp.com"
CLICKABLE_SELECTOR = "button, input[type='button'], input[type='submit'], a, [role='button'], [onclick]"
OUTPUT_JSON = Path("logs/live_button_deep_audit_report.json")


def compact(value: str) -> str:
    return " ".join((value or "").split())


def random_email() -> str:
    return f"truckopti.test.{int(time.time())}.{random.randint(1000, 9999)}@example.com"


def random_phone() -> str:
    return f"9{random.randint(100000000, 999999999)}"


def collect_descriptors(page):
    return page.evaluate(
        r"""
        (selector) => {
          const nodes = Array.from(document.querySelectorAll(selector));
          return nodes.map((node, index) => ({
            index,
            tag: (node.tagName || '').toLowerCase(),
            text: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' '),
            id: node.id || '',
            name: node.getAttribute('name') || '',
            role: node.getAttribute('role') || '',
            type: node.getAttribute('type') || '',
            href: node.getAttribute('href') || '',
            ariaLabel: node.getAttribute('aria-label') || ''
          }));
        }
        """,
        CLICKABLE_SELECTOR,
    )


def safe_fill(page, selector: str, value: str):
    locator = page.locator(selector)
    if locator.count() > 0 and locator.first.is_visible():
        locator.first.fill(value)


def setup_login_prefill(page):
    safe_fill(page, "input[type='email']", random_email())


def setup_signup_prefill(page):
    safe_fill(page, "input[name='name']", "TruckOpti Test User")
    safe_fill(page, "input[name='full_name']", "TruckOpti Test User")
    safe_fill(page, "input[type='email']", random_email())
    safe_fill(page, "input[type='tel']", random_phone())
    safe_fill(page, "input[name='phone']", random_phone())
    safe_fill(page, "input[type='password']", "TruckOpti@Test123")

    checkboxes = page.locator("input[type='checkbox']")
    count = checkboxes.count()
    for idx in range(count):
        cb = checkboxes.nth(idx)
        if cb.is_visible() and not cb.is_checked():
            cb.check()


def run_scenario(page, name, path, setup_fn, trackers):
    console_errors, page_errors, failed_responses = trackers

    scenario_url = f"{BASE_URL}{path}"
    page.goto(scenario_url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)

    descriptors = collect_descriptors(page)
    results = []

    for descriptor in descriptors:
        idx = descriptor["index"]

        page.goto(scenario_url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(800)
        setup_fn(page)
        page.wait_for_timeout(400)

        locator = page.locator(CLICKABLE_SELECTOR).nth(idx)
        if locator.count() == 0:
            results.append(
                {
                    "element": descriptor,
                    "status": "not-found",
                    "error": "element not found after reload",
                }
            )
            continue

        before_console = len(console_errors)
        before_page_errors = len(page_errors)
        before_failed_responses = len(failed_responses)

        before_url = page.url
        status = "ok"
        error = ""

        try:
            element = locator.first
            if not element.is_visible():
                status = "skipped-hidden"
            elif element.is_disabled():
                status = "skipped-disabled"
            else:
                element.scroll_into_view_if_needed(timeout=5000)
                element.click(timeout=10000)
                page.wait_for_timeout(2200)
        except PlaywrightTimeoutError as exc:
            status = "timeout"
            error = str(exc)
        except Exception as exc:
            status = "exception"
            error = str(exc)

        results.append(
            {
                "element": {
                    **descriptor,
                    "text": compact(descriptor.get("text", "")),
                },
                "status": status,
                "error": error,
                "url_before": before_url,
                "url_after": page.url,
                "navigated": before_url != page.url,
                "console_errors": console_errors[before_console:],
                "page_errors": page_errors[before_page_errors:],
                "failed_responses": failed_responses[before_failed_responses:],
            }
        )

    return {
        "scenario": name,
        "path": path,
        "elements_tested": len(results),
        "results": results,
    }


def main():
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()

        console_errors = []
        page_errors = []
        failed_responses = []

        page.on(
            "console",
            lambda msg: console_errors.append(
                {
                    "time": time.time(),
                    "type": msg.type,
                    "text": msg.text,
                }
            )
            if msg.type == "error"
            else None,
        )
        page.on(
            "pageerror",
            lambda exc: page_errors.append(
                {
                    "time": time.time(),
                    "text": str(exc),
                }
            ),
        )
        def handle_response(response):
            if response.status < 400:
                return

            response_text = ""
            try:
                response_text = (response.text() or "")[:400]
            except Exception:
                response_text = "<unavailable>"

            failed_responses.append(
                {
                    "time": time.time(),
                    "url": response.url,
                    "status": response.status,
                    "method": response.request.method,
                    "response_text": compact(response_text),
                }
            )

        page.on("response", handle_response)

        trackers = (console_errors, page_errors, failed_responses)

        scenarios = [
            ("login_default", "/login", lambda current_page: None),
            ("login_prefilled", "/login", setup_login_prefill),
            ("signup_prefilled", "/signup", setup_signup_prefill),
        ]

        scenario_results = [
            run_scenario(page, name, path, setup_fn, trackers)
            for (name, path, setup_fn) in scenarios
        ]

        browser.close()

    def has_errors(result):
        return (
            result["status"] not in {"ok", "skipped-hidden", "skipped-disabled"}
            or len(result["console_errors"]) > 0
            or len(result["page_errors"]) > 0
            or len(result["failed_responses"]) > 0
        )

    total = sum(item["elements_tested"] for item in scenario_results)
    error_count = sum(
        1
        for item in scenario_results
        for result in item["results"]
        if has_errors(result)
    )

    report = {
        "base_url": BASE_URL,
        "scenarios": scenario_results,
        "summary": {
            "elements_tested": total,
            "elements_with_errors": error_count,
        },
    }

    OUTPUT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Deep audit complete: {OUTPUT_JSON}")
    print(f"Elements tested: {total}")
    print(f"Elements with errors: {error_count}")


if __name__ == "__main__":
    main()