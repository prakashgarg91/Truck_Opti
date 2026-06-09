
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//signup", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/05-signup.png", full_page=False)
    print("PATH=/signup")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))
