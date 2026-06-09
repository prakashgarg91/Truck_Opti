
    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/agency/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09b-agency-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))
