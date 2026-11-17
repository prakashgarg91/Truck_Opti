// Shared focus ring, same as AgencyTeamPage.tsx.
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

export const BTN_PRIMARY = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`
export const BTN_SECONDARY = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 ${FOCUS_RING}`
