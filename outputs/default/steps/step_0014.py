
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.set_viewport_size({"width": 1280, "height": 800})
    await page.goto("https://www.truckopti.in/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    google_btn = page.locator('button:has-text("Google"), a:has-text("Google")').first
    google_count = await page.locator('button:has-text("Google"), a:has-text("Google")').count()
    print("GOOGLE_BUTTONS=" + str(google_count))
    if google_count > 0:
        await google_btn.click()
        await page.wait_for_timeout(2000)
    print("POST_CLICK_URL=" + page.url)
    print("REDIRECTED_TO_GOOGLE=" + ("YES" if "accounts.google.com" in page.url else "NO"))
