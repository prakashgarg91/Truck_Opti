"""Probe role-registration pages."""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context()
        for path in ["/driver/register", "/agency/register"]:
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
                body = (await page.inner_text("body"))[:1500]
                print(f"--- {path} ---")
                print(f"  status={status} final={final}")
                print(f"  title={t!r}")
                print(f"  body={body!r}")
                # List links
                links = await page.locator("a").all()
                print(f"  links ({len(links)}):")
                for L in links[:30]:
                    try:
                        href = await L.get_attribute("href")
                        txt = (await L.text_content() or "").strip()
                        if txt or href:
                            print(f"    - {txt!r} -> {href!r}")
                    except Exception:
                        pass
            except Exception as e:
                print(f"--- {path} FAILED: {e}")
            await page.close()
        await ctx.close()
        await browser.close()

asyncio.run(main())
