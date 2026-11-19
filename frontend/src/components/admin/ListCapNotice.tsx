// Shown under an admin list whose Edge function returns at most `cap` rows with no paging.
// When the row count reaches the cap, rows beyond it exist but cannot be reached from this
// screen, so the notice says so instead of letting the list look complete.
// Search and filters on these pages run on the loaded rows only, so the wording never
// promises that they can reach hidden rows.

export const ADMIN_LIST_ROW_CAP = 200

interface ListCapNoticeProps {
  /** Number of rows the last successful fetch returned. */
  rowCount: number
  /** The server-side row cap. Defaults to the cap shared by the admin list functions. */
  cap?: number
  /** Stable hook for tests and page-specific styling. */
  testId: string
}

export default function ListCapNotice({ rowCount, cap = ADMIN_LIST_ROW_CAP, testId }: ListCapNoticeProps) {
  if (rowCount < cap) {
    return null
  }

  return (
    <p role="status" data-testid={testId} className="text-sm text-slate-600 dark:text-slate-300 pt-3">
      {`Showing the first ${cap} only.`}
    </p>
  )
}
