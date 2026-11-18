/**
 * TO-139 — single source of truth for the support contact shown to users.
 *
 * Support is EMAIL ONLY (owner decision, docs/FABLE-RULINGS-2026-11-18-C.md §3).
 * No platform support phone number is shown or linked anywhere a visitor,
 * customer, driver or agency user can see. Every surface that offers
 * "contact support" must read the address from here so no screen invents its
 * own address. User-owned phone numbers (driver, agency, customer) are not
 * platform support contacts and are unaffected.
 */
export const SUPPORT_EMAIL = 'prakashgarg91@gmail.com'

/** In-app support form route (Contact page, authenticated variant). */
export const SUPPORT_PATH = '/support'
