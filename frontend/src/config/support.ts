/**
 * TO-139 — single source of truth for the support contact shown to users.
 *
 * Values are the owner-configured contact (commit edcee619, "update contact
 * info"): the phone and mailbox the owner published on the Contact page.
 * Every surface that offers "contact support" must read from here so no
 * screen invents its own number or address.
 */
export const SUPPORT_PHONE_DISPLAY = '+91 99993 52050'

/** Dial-safe form for `tel:` links (no spaces). */
export const SUPPORT_PHONE_TEL = '+919999352050'

export const SUPPORT_EMAIL = 'prakashgarg91@gmail.com'

/** In-app support form route (Contact page, authenticated variant). */
export const SUPPORT_PATH = '/support'
