# TruckOpti Full Public Route Smoke Test

You are testing the live production app at https://truckopti.in/

## Your Task

Perform a comprehensive smoke test of all publicly accessible routes and features. For each page, verify:
1. Page loads without errors (check URL, title, visible content)
2. Key UI elements are present and functional
3. Forms validate input correctly
4. Navigation links work

## Step-by-step Test Plan

### Phase 1: Homepage and Static Pages
1. Visit https://truckopti.in/ — verify hero section, navigation, CTAs load
2. Take a screenshot of the homepage
3. Visit /pricing — verify pricing cards render, monthly/yearly toggle works (click it, verify prices change)
4. Visit /contact — verify form fields exist, try submitting empty form and check validation
5. Visit /terms — verify page loads with content
6. Visit /privacy — verify page loads with content

### Phase 2: Authentication Pages
7. Visit /login?mode=driver — verify driver login form renders, check page title includes "driver"
8. Visit /login?mode=agency — verify agency login form renders
9. Visit /signup — verify signup form renders with email/password fields and Google sign-in button
10. Visit /forgot-password — verify reset form renders

### Phase 3: Role Registration (Known Issue Verification)
11. Visit /driver/register — verify what happens (past finding: may redirect to login or be gated behind auth)
12. Visit /agency/register — verify what happens (past finding: same gating issue)
13. CHECK: Can a new user reach a signup/create-account flow from /driver/register? Document the exact navigation path or dead-end.
14. CHECK: Browser title on /driver/register — is it generic "TruckOpti - Smart Logistics" or specific? (past finding: generic title is a bug)

### Phase 4: Navigation and Cross-links
15. From homepage, click the Login button/link — where does it go?
16. From homepage, click the Signup/Register link — where does it go?
17. Try the Google Sign-In button on /login — verify it launches Google OAuth popup/redirect (do NOT complete it)
18. Test responsive: resize viewport to mobile (375x812) and reload homepage, take screenshot

### Phase 5: Form Validation
19. On /login, try submitting with empty fields — verify button is disabled or validation fires
20. On /signup, try submitting with invalid email — verify validation message
21. On /contact, fill in only some required fields and submit — verify validation

## Output Format

After completing all tests, provide a structured report:
- PASS/FAIL for each test item above
- Exact URLs visited and their HTTP status
- Page titles observed
- Screenshots saved for key pages
- Any JavaScript console errors noticed
- Specific findings about the role-registration dead-end issue
- Specific findings about page title consistency
- Any new bugs or issues discovered

## Constraints
- Do NOT submit real forms (no real account creation, no real emails sent)
- Do NOT complete Google OAuth
- Do NOT enter real payment information
- Focus on public routes only; authenticated areas are out of scope
- Save all screenshots to the workspace screenshots/ directory
