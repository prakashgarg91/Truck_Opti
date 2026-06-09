
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    import json as _j
    # Direct /otp visit.
    await page.goto("https://www.truckopti.in/otp", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    print("OTP_DIRECT_URL=" + page.url)
    print("OTP_DIRECT_TITLE=" + (await page.title()))
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/10a-otp-direct.png", full_page=False)
    # Full login flow.
    await page.goto("https://www.truckopti.in/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.locator('input[type="email"]').first.fill("smoketest2026@truckopti.in")
    send = page.locator('button:has-text("Send OTP"), button:has-text("Get OTP"), button:has-text("Send Code"), button:has-text("Continue")').first
    if await send.count() > 0:
        print("SEND_BTN_DISABLED=" + str(await send.is_disabled()))
        await send.click()
        await page.wait_for_timeout(2500)
    print("POST_SEND_URL=" + page.url)
    print("POST_SEND_TITLE=" + (await page.title()))
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/10b-post-send.png", full_page=True)
    otp_inputs = await page.locator('input[inputmode="numeric"], input[pattern="[0-9]*"]').count()
    print("OTP_INPUT_BOXES=" + str(otp_inputs))
    all_inputs = await page.evaluate("() => Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name, maxLength: i.maxLength, inputMode: i.inputMode, pattern: i.pattern, placeholder: i.placeholder}))")
    print("ALL_INPUTS=" + _j.dumps(all_inputs))
