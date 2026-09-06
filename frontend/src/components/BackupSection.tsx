import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { backupNow, driveTokenStore, restoreNow } from '../lib/backup'
import { logger } from '../utils/logger'

// Device backup controls: Google Drive snapshot upload / restore with
// revision-conflict protection. Token is pasted by the owner until GIS
// login supplies it automatically.
export default function BackupSection() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setToken(driveTokenStore.get() ?? '')
  }, [])

  const saveToken = () => {
    driveTokenStore.set(token.trim())
    toast.success('Drive token saved on this device')
  }

  const run = async (fn: () => Promise<{ tables: Record<string, number>; storedBytes: number; conflict?: boolean }>, label: string) => {
    setBusy(true)
    setStatus(null)
    try {
      const r = await fn()
      if (r.conflict) {
        setStatus('Conflict: Drive has a newer backup. Nothing was overwritten — resolve in Drive, then retry.')
        toast.error('Backup conflict — newer data on Drive')
        return
      }
      const total = Object.values(r.tables).reduce((a, b) => a + b, 0)
      setStatus(`${label} done: ${total} rows, ${(r.storedBytes / 1024).toFixed(1)} KB`)
      toast.success(`${label} complete`)
    } catch (e) {
      logger.error('[Backup]', e)
      const msg = e instanceof Error ? e.message : 'Backup failed. Please try again.'
      setStatus(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
        Device Backup (Google Drive)
      </h2>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Drive access token</label>
        <div className="flex gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste Google OAuth token"
            type="password"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 outline-none text-sm"
          />
          <button onClick={saveToken} className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 font-semibold text-sm">
            Save
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Encryption password (optional)</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave empty for plain backup"
          type="password"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 outline-none text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => run(() => backupNow(password ? { password } : {}), 'Backup')}
          disabled={busy}
          className="flex-1 py-3 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Back up now'}
        </button>
        <button
          onClick={() => run(() => restoreNow(password ? { password } : {}), 'Restore')}
          disabled={busy}
          className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 rounded-2xl font-semibold disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Restore'}
        </button>
      </div>
      {status && <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>}
    </div>
  )
}
