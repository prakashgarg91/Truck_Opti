"""Quick probe of /login to understand structure."""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context()
        for path in ["/login", "/login?mode=driver", "/login?mode=agency", "/signup", "/forgot-password"]:
            page = await ctx.new_page()
            url = f"https://truckopti.in{path}"
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=6000)
                except Exception:
                    pass
                status = resp.status if resp else None
                final = page.url
                t = await page.title()
                body = (await page.inner_text("body"))[:1200]
                has_email = await page.locator('input[type="email"], input[name="email"]').count()
                has_password = await page.locator('input[type="password"]').count()
                has_google = await page.locator('button:has-text("Google"), a:has-text("Google")').count()
                has_submit = await page.locator('button[type="submit"]').count()
                print(f"--- {path} ---")
                print(f"  status={status} final={final}")
                print(f"  title={t!r}")
                print(f"  inputs: email={has_email} password={has_password} google={has_google} submit={has_submit}")
                print(f"  body[:600]={body[:600]!r}")
            except Exception as e:
                print(f"--- {path} FAILED: {e}")
            await page.close()
        await ctx.close()
        await browser.close()

asyncio.run(main())
