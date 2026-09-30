# TO-123 — Make every login surface usable and consistent

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-122 and TO-124 accepted. Follow repository Stitch policy for UI work.

## Goal and evidence

LoginPage still renders the OTP form when both OTP flags are false, displays VITE_AUTH_PASSWORD_ENABLED to users, and GoogleSignInButton renders needs setup. Office login can expose no usable cloud method.

## Allowed scope

frontend/src/pages/auth/LoginPage.tsx; SignupPage.tsx; ForgotPasswordPage.tsx; ResetPasswordPage.tsx; frontend/src/components/GoogleSignInButton.tsx (presentation only); docs/design-audit.md; focused auth UI/browser tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Consume the validated provider capabilities from TO-124. Render only enabled, configured methods. Default office/demo/reviewer to password when provisioned; if no cloud method exists, render honest maintenance/help copy and a clearly separate local device workspace. Do not change the selected public Google-first policy silently. Password is required for office/reviewer if those account journeys remain supported; public email/phone OTP stays optional until provisioned. Hide disabled OTP fields and submit buttons; remove environment names and developer setup instructions from public copy. Ensure sign-up/reset routes match enabled methods. Add labels, visible focus, accessible errors, pending/disabled states and safe help navigation. Reuse current design; redesign only where required by the broken journey.

## Required checks

Exercise no-provider, Google-only, password-only, email-only and configured phone combinations at 390x844 and 1280x900. Test office/customer/driver/agency surfaces, keyboard flow, wrong credentials and provider outage. Run build, lint, unit and browser checks; update the design audit with actual route evidence.

## Acceptance

No login page suggests an unavailable method; office login has a working configured path or an honest blocked state; mobile/desktop and accessibility evidence are recorded.

## Handoff

Write agent-results/013-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
