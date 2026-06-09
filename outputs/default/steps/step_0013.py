
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto("https://www.truckopti.in/", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/11-mobile-home.png", full_page=False)
    menu_button = await page.locator('button[aria-label*="menu" i], button[aria-label*="Menu"], [class*="hamburger"], [class*="mobile-menu"]').count()
    has_h_scroll = await page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")
    print("MENU_BUTTONS=" + str(menu_button))
    print("HORIZONTAL_SCROLL=" + ("YES" if has_h_scroll else "NO"))
