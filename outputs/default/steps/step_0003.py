
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/pricing", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02a-pricing-default.png", full_page=True)
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
                    prices_after = await page.evaluate("""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break
