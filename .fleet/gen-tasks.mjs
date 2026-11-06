// Generates .fleet/tasks.json (the task-level plan for the ZCode fleet). Re-run after editing.
import { writeFileSync } from 'node:fs'

const tasks = []

const testPages = [
  ['AgencyJobsPage', 'agency job board: list, filters, offers and status actions; services/agencyPortalApi.ts agencyJobsApi and services/agencySupabaseApi.ts'],
  ['AgencyRatesPage', 'agency rate cards (legacy agencyRatesApi): list, add, toggle, delete'],
  ['AgencyBillingPage', 'agency billing summary and delivered jobs (agencyBillingApi)'],
  ['AgencyProfilePage', 'agency profile view and edit'],
  ['AgencyRegisterPage', 'agency registration form and validation'],
  ['DriverEarningsPage', 'driver earnings and payouts'],
  ['DriverHistoryPage', 'driver trip history'],
  ['DriverProfilePage', 'driver profile page (docs/design-audit.md notes Account Center links that self-link; record that as a FINDING if it is still true)'],
  ['DriverRegisterPage', 'driver registration form and validation'],
  ['AdminDashboardPage', 'admin dashboard counters'],
  ['AdminDriversPage', 'admin driver list and approval actions'],
  ['AdminAgenciesPage', 'admin agency list and approval or suspension actions'],
  ['AdminUsersPage', 'admin user list'],
  ['AdminPayoutsPage', 'admin payouts review'],
  ['AdminSubscriptionsPage', 'admin subscriptions list'],
  ['ShipmentHistoryPage', 'customer shipment history'],
  ['CompanyProfilePage', 'company profile and backup section (BackupSection is a child component; mock it)'],
]

for (const [page, desc] of testPages) {
  const slug = page.replace(/Page$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const file = `frontend/src/pages/${page}.test.ts`
  tasks.push({
    id: `z-truck-test-${slug}`,
    title: `regression tests for ${page}`,
    kind: 'zcode-test',
    priority: 4,
    allow: [file],
    brief: `Page: frontend/src/pages/${page}.tsx (${desc}). Create ${file}. Read the page first, then every service and store it imports (read its import lines) so your mocks have the right shapes.`,
    check: `cd frontend && npx vitest run src/pages/${page}.test.ts`,
  })
}

const docs = [
  ['agency-guide', 'docs/USER-GUIDE-AGENCY.md', 'User guide for a transport-agency owner and staff: register and approval, fleet (vehicles), drivers (employment, invitations), jobs and offers, clients and tariffs, team and scopes, billing. Reader: a non-technical agency owner. Describe only what exists in the app routes (frontend/src/App.tsx) and say "planned" for TASKS.md modules not built (orders import, GR/LR, tracking, invoices, expenses, payroll).'],
  ['driver-guide', 'docs/USER-GUIDE-DRIVER.md', 'User guide for a truck driver: registration and KYC, going online, receiving and accepting a job offer with OTP, pickup, transit, delivery proof, earnings, history. Reader: a driver on a phone. Source: the frontend driver pages and services. Keep sentences very short.'],
  ['deploy-runbook', 'docs/DEPLOYMENT-RUNBOOK.md', 'Deployment and rollback runbook for the hosted pilot: environments, required settings by NAME only (never values), Supabase migration order, Edge function deploy, Heroku deploy, health checks (/healthz and /readyz), smoke test, rollback steps, backup and restore. Mark every step that only the owner may perform with [OWNER]. Sources: package.json, Procfile, heroku.yml, deploy-heroku.sh, supabase/, docs/QUICK_DEPLOY.md, docs/payment-production-handoff.md, TASKS.md.'],
  ['changelog', 'CHANGELOG.md', 'Keep-a-Changelog style CHANGELOG.md summarising delivered work grouped by date, from git history (git log is available) and TASKS.md. The current package version is in package.json. Facts only.'],
  ['landing-copy', 'docs/sales/LANDING-COPY.md', 'Landing page copy for the subscription: headline, subhead, 6 benefit blocks, how it works in 4 steps, FAQ (8 questions), call to action. Audience: owners of small Indian trucking agencies (5-10 trucks). Claim only features that exist today; mark upcoming ones as "coming soon".'],
  ['sales-checklist', 'docs/sales/SALES-CHECKLIST.md', 'Sales and pilot-onboarding checklist for a human seller: qualification questions, a 10-minute demo script using real routes of the app, data the agency must provide, pilot success measures, objections and answers, what is not yet available. Facts from the repo only.'],
  ['support', 'docs/SUPPORT.md', 'Support policy and first-line troubleshooting guide: how to contact support (leave phone and email as clearly marked placeholders for the owner), response times as placeholders, the 12 most likely problems an agency or driver hits with fixes drawn from the code (login and OTP, approval pending, driver not approved, vehicle not eligible, offer expired, invitation code, version conflict message).'],
]

for (const [slug, file, brief] of docs) {
  tasks.push({
    id: `z-truck-doc-${slug}`,
    title: `documentation: ${slug}`,
    kind: 'zcode-docs',
    priority: 7,
    allow: [file],
    brief,
    check: `node -e "if(require('fs').readFileSync('${file}','utf8').length<2500)process.exit(1)"`,
  })
}

writeFileSync(new URL('./tasks.json', import.meta.url), JSON.stringify(tasks, null, 2))
console.log(tasks.length, 'tasks written')
