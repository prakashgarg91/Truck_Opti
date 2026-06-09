"""Probe homepage CTAs and nav."""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        resp = await page.goto("https://truckopti.in/", wait_until="domcontentloaded", timeout=20000)
        try:
            await page.wait_for_load_state("networkidle", timeout=6000)
        except Exception:
            pass
        print(f"status={resp.status} title={await page.title()!r}")
        # All anchors and buttons with text
        items = []
        for L in await page.locator("a, button").all():
            try:
                txt = (await L.text_content() or "").strip()
                href = await L.get_attribute("href") if await L.evaluate("el => el.tagName.toLowerCase()") == "a" else None
                if txt:
                    items.append((txt[:60], href))
            except Exception:
                pass
        print(f"CTA items: {len(items)}")
        for t, h in items[:50]:
            print(f"  {t!r}  -> {h!r}")
        await ctx.close()
        await browser.close()

asyncio.run(main())
