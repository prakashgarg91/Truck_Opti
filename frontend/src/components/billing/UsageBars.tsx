import { buildUsageRows, type Entitlement } from '../../lib/billingState'

/** One bar per limit with the exact numbers from the entitlement RPC. */
export default function UsageBars({ entitlement }: { entitlement: Entitlement }) {
  const rows = buildUsageRows(entitlement)
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plan usage">
      {rows.map((row) => (
        <li key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
          <div className="flex items-center justify-between gap-3">
            <span id={`usage-${row.key}`} className="text-sm font-medium text-slate-800 dark:text-slate-100">{row.label}</span>
            <span className={`text-sm font-semibold ${row.atLimit ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>{row.text}</span>
          </div>
          <div
            role="progressbar"
            aria-labelledby={`usage-${row.key}`}
            aria-valuemin={0}
            aria-valuemax={row.limit ?? row.used}
            aria-valuenow={row.used}
            aria-valuetext={row.text}
            className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          >
            <div
              className={`h-full rounded-full ${row.atLimit ? 'bg-red-600' : 'bg-indigo-600'}`}
              style={{ width: `${row.percent}%` }}
            />
          </div>
          {row.atLimit && <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">Limit reached</p>}
        </li>
      ))}
    </ul>
  )
}
