#!/usr/bin/env python3
import json
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "https://truck-opti-app-efabf95bd306.herokuapp.com/"
CLICKABLE_SELECTOR = "button, input[type='button'], input[type='submit'], a, [role='button'], [onclick]"
OUTPUT_JSON = Path("logs/live_button_audit_report.json")


def normalize_text(value: str) -> str:
    return " ".join((value or "").split())


def collect_clickable_descriptors(page):
    return page.evaluate(
        """
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
            ariaLabel: node.getAttribute('aria-label') || '',
            title: node.getAttribute('title') || ''
          }));
        }
        """,
        CLICKABLE_SELECTOR,
    )


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
        page.on(
            "response",
            lambda response: failed_responses.append(
                {
                    "time": time.time(),
                    "url": response.url,
                    "status": response.status,
                }
            )
            if response.status >= 400
            else None,
        )

        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2000)

        descriptors = collect_clickable_descriptors(page)
        results = []

        for descriptor in descriptors:
            index = descriptor["index"]
            page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(1200)

            locator = page.locator(CLICKABLE_SELECTOR).nth(index)

            if locator.count() == 0:
                results.append(
                    {
                        "element": descriptor,
                        "clicked": False,
                        "status": "not-found",
                        "error": "element not found by index on reload",
                    }
                )
                continue

            before_console = len(console_errors)
            before_pageerror = len(page_errors)
            before_failed_responses = len(failed_responses)
            before_url = page.url

            click_status = "ok"
            click_error = ""

            try:
                if not locator.first.is_visible():
                    click_status = "skipped-hidden"
                elif locator.first.is_disabled():
                    click_status = "skipped-disabled"
                else:
                    locator.first.scroll_into_view_if_needed(timeout=5000)
                    locator.first.click(timeout=8000)
                    page.wait_for_timeout(1800)
            except PlaywrightTimeoutError as exc:
                click_status = "timeout"
                click_error = str(exc)
            except Exception as exc:
                click_status = "exception"
                click_error = str(exc)

            element_console_errors = console_errors[before_console:]
            element_page_errors = page_errors[before_pageerror:]
            element_failed_responses = failed_responses[before_failed_responses:]

            results.append(
                {
                    "element": {
                        **descriptor,
                        "text": normalize_text(descriptor.get("text", "")),
                    },
                    "clicked": click_status == "ok",
                    "status": click_status,
                    "error": click_error,
                    "url_before": before_url,
                    "url_after": page.url,
                    "navigated": before_url != page.url,
                    "console_errors": element_console_errors,
                    "page_errors": element_page_errors,
                    "failed_responses": element_failed_responses,
                }
            )

        browser.close()

    summary = {
        "base_url": BASE_URL,
        "tested_elements": len(results),
        "error_elements": sum(
            1
            for result in results
            if result["status"] not in {"ok", "skipped-hidden", "skipped-disabled"}
            or result["console_errors"]
            or result["page_errors"]
            or result["failed_responses"]
        ),
        "results": results,
    }

    OUTPUT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Audit complete: {OUTPUT_JSON}")
    print(f"Tested elements: {summary['tested_elements']}")
    print(f"Elements with errors: {summary['error_elements']}")


if __name__ == "__main__":
    main()