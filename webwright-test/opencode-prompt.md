You are testing the live production app at https://truckopti.in/

IMPORTANT CONTEXT:
- Webwright is already installed in this Python environment 
- Playwright chromium is already installed
- The OPENROUTER_API_KEY in the environment is INVALID (returns 401). Do NOT try to use webwright directly.
- Instead, use Playwright directly via Python scripts to perform the testing.
- Write Python scripts that use Playwright (async API) to visit each page and capture results.

## Task

Write and execute Python scripts using Playwright to smoke test all publicly accessible routes of truckopti.in. 

For each page, verify:
1. Page loads without errors (check URL, title, visible content)
2. Key UI elements are present and functional
3. Forms validate input correctly
4. Navigation links work

## Step-by-step Test Plan

### Phase 1: Homepage and Static Pages
1. Visit https://truckopti.in/ - verify hero section, navigation, CTAs load, take screenshot
2. Visit /pricing - verify pricing cards render, test monthly/yearly toggle (click it, verify prices change), take screenshot
3. Visit /contact - verify form fields exist, try submitting empty form and check validation, take screenshot
4. Visit /terms - verify page loads with content
5. Visit /privacy - verify page loads with content

### Phase 2: Authentication Pages
6. Visit /login?mode=driver - verify driver login form renders, check page title
7. Visit /login?mode=agency - verify agency login form renders, check page title
8. Visit /signup - verify signup form renders with email/password fields and Google sign-in button
9. Visit /forgot-password - verify reset form renders

### Phase 3: Role Registration (Known Issue Verification)
10. Visit /driver/register - verify what happens (past finding: may redirect or require auth)
11. Visit /agency/register - verify what happens
12. Check: Can a new user reach a signup/create-account flow from /driver/register?
13. Check: Browser title on /driver/register - is it generic "TruckOpti - Smart Logistics" or specific?

### Phase 4: Navigation and Cross-links
14. From homepage, click Login button - where does it go?
15. From homepage, click Signup link - where does it go?
16. Test Google Sign-In button on /login - verify it launches OAuth (do NOT complete)
17. Test responsive: resize to mobile (375x812) and screenshot homepage

### Phase 5: Form Validation
18. On /login, try empty submission - verify button state/validation
19. On /signup, try invalid email - verify validation message
20. On /contact, partial fill and submit - verify validation

## Constraints
- Do NOT submit real forms or create real accounts
- Do NOT complete Google OAuth
- Do NOT enter payment information
- Save all screenshots to D:\Github\Truck_Opti\webwright-test\screenshots/
- Use headless Chromium via Playwright

## Output
After completing all tests, provide a structured PASS/FAIL report for each test item, with:
- Exact URLs visited and their HTTP status
- Page titles observed
- Any JavaScript console errors
- Specific findings about role-registration dead-end issue
- Specific findings about page title consistency
- Any new bugs discovered

Write the results to D:\Github\Truck_Opti\webwright-test\test-report.md
