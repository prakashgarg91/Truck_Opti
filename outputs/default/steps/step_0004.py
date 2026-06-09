
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/contact", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    import json as _j
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/03a-contact-empty.png", full_page=False)
    submit = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Submit")').first
    if await submit.count() > 0:
        await submit.click()
        await page.wait_for_timeout(500)
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/03b-contact-errors.png", full_page=False)
    err_count = await page.locator('[role="alert"], .text-red-500, .text-red-600, .text-red-700, [aria-invalid="true"]').count()
    print("CONTACT_TITLE=" + title)
    print("CONTACT_ERRORS_AFTER_EMPTY_SUBMIT=" + str(err_count))
