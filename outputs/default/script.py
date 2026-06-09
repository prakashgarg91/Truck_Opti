# Step 12-google-launch

async def __agent_step__(page, context, browser, playwright, task):
    
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




# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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
                    prices_after = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => { const t = (e.innerText || '').trim(); return t.length > 0 && t.length < 30 && /\$/.test(t) && /\d/.test(t) && e.children.length === 0; }).map(e => (e.innerText||'').trim()).slice(0, 12)""")
                    print("PRICES_AFTER=" + _j.dumps(prices_after))
                    savings = await page.evaluate(r"""() => Array.from(document.querySelectorAll('*')).filter(e => /save|off|%/i.test(e.innerText || '') && e.children.length === 0 && (e.innerText||'').trim().length < 60).map(e => (e.innerText||'').trim()).slice(0, 6)""")
                    print("SAVINGS_TEXT=" + _j.dumps(savings))
                    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/02b-pricing-after-" + label + ".png", full_page=True)
                    break
            break



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))



# Step 1

_LISTENERS_INSTALLED = False
_console_errors = []
_network_errors = []



# Step 2

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



# Step 3

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



# Step 4

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



# Step 5

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/04-login.png", full_page=False)
    print("PATH=/login")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 6

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



# Step 7

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//forgot-password", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/06-forgot-password.png", full_page=False)
    print("PATH=/forgot-password")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 8

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//terms", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/07-terms.png", full_page=False)
    print("PATH=/terms")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 9

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in//privacy", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    title = await page.title()
    h1 = await page.evaluate("() => document.querySelector('h1, h2')?.innerText || null")
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/08-privacy.png", full_page=False)
    print("PATH=/privacy")
    print("TITLE=" + (title or ""))
    print("H1=" + (h1 or ""))



# Step 10

    global _LISTENERS_INSTALLED
    try:
        if not _LISTENERS_INSTALLED:
            page.on("console", lambda msg: (_console_errors.append({"url": page.url, "type": msg.type, "text": msg.text}) if msg.type == "error" else None))
            page.on("pageerror", lambda exc: _console_errors.append({"url": page.url, "type": "pageerror", "text": str(exc)}))
            page.on("response", lambda resp: _network_errors.append({"url": resp.url, "status": resp.status}) if resp.status >= 400 else None)
            _LISTENERS_INSTALLED = True
    except NameError:
        pass

    await page.goto("https://www.truckopti.in/driver/register", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    final_url = page.url
    title = await page.title()
    await page.screenshot(path=r"D:\\Github\\Truck_Opti\\0.dev-matrix\\test-reports\\webwright-full-app-2026-06-01/09a-driver-register.png", full_page=False)
    body_text = await page.evaluate("() => document.body.innerText.toLowerCase()")
    print("FINAL_URL=" + final_url)
    print("TITLE=" + title)
    print("TITLE_IS_GENERIC=" + ("YES" if title == "TruckOpti - Smart Logistics" else "NO"))
    print("HAS_LOGIN_FORM=" + ("YES" if "password" in body_text and "log in" in body_text else "NO"))
    print("HAS_CREATE_ACCOUNT_LINK=" + ("YES" if "create account" in body_text or "sign up" in body_text or "register" in body_text else "NO"))
    print("HAS_DRIVER_LANDING=" + ("YES" if "driver" in body_text else "NO"))
    print("HAS_AGENCY_LANDING=" + ("YES" if "agency" in body_text else "NO"))



# Step 11

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



# Step 12

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



# Step 13

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



# Step 14

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



# Step 15

print("CONSOLE_ERRORS=" + str(_console_errors))
print("NETWORK_ERRORS=" + str(_network_errors))

