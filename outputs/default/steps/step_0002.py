
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    h1_text = await page.evaluate("() => document.querySelector('h1')?.innerText || null")
    nav_links = await page.evaluate("() => Array.from(document.querySelectorAll('a, button')).map(el => ({tag: el.tagName, text: (el.innerText||'').trim().slice(0,60), href: el.getAttribute('href') || null})).filter(x => x.text).slice(0, 30)")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/01-home.png", full_page=False)
    print("TITLE=" + (title or ""))
    print("H1=" + (h1_text or ""))
    print("NAV_COUNT=" + str(len(nav_links)))
    print("NAV_LINKS=" + _j.dumps(nav_links))
