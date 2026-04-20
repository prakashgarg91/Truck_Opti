# Adding a New Module to TruckOpti

This guide walks you through adding a fully integrated new page/feature from scratch. Follow every step in order — skipping steps causes broken routing, missing auth guards, or untested DB access.

---

## Prerequisites

- Node.js 18+ installed
- `.env.local` configured with Supabase credentials
- `cd frontend && npm install` completed
- Supabase CLI available (`npx supabase --version`)

---

## Step 1: Create the Page File

Create your new page in `frontend/src/pages/`. Use the template at the end of this guide.

```powershell
# Example: adding a Fuel Logs module
New-Item "frontend\src\pages\FuelLogsPage.tsx" -ItemType File
```

**Naming rules:**
- File name: `PascalCase` + `Page.tsx` (e.g. `FuelLogsPage.tsx`)
- Component name: same as file name without extension
- Admin pages: `frontend/src/pages/AdminFuelLogsPage.tsx`
- Driver pages: `frontend/src/pages/DriverFuelPage.tsx`

**Minimum page structure** (copy from template below, then customise):

```tsx
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

export default function FuelLogsPage() {
  const { user } = useAuthStore()
  const [logs, setLogs] = useState<FuelLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fuelLogsApi.getAll()
        setLogs(data)
      } catch (err) {
        logger.error('[FuelLogsPage] load:', err)
        toast.error(toUserFacingErrorMessage(err, 'Could not load fuel logs.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Fuel Logs</h1>
      {/* render logs */}
    </div>
  )
}
```

---

## Step 2: Add the Route in `App.tsx`

Open `frontend/src/App.tsx`. Choose the correct route group for your role.

### 2a. Add the lazy import at the top (with all other lazy imports):

```tsx
const FuelLogsPage = React.lazy(() => import('./pages/FuelLogsPage'))
```

### 2b. Add the `<Route>` inside the correct `<ProtectedRoute>` block:

**Customer/All-user route:**
```tsx
<Route element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
  {/* existing routes ... */}
  <Route path="/fuel-logs" element={<FuelLogsPage />} />
</Route>
```

**Driver-only route:**
```tsx
<Route element={<ProtectedRoute allowedRoles={['driver']}><DriverLayout /></ProtectedRoute>}>
  <Route path="/driver/fuel" element={<FuelLogsPage />} />
</Route>
```

**Agency-only route:**
```tsx
<Route element={<ProtectedRoute allowedRoles={['agency']}><AgencyLayout /></ProtectedRoute>}>
  <Route path="/agency/fuel" element={<FuelLogsPage />} />
</Route>
```

**Admin-only route:**
```tsx
<Route element={<ProtectedRoute allowedRoles={['admin']}><MobileLayout /></ProtectedRoute>}>
  <Route path="/admin/fuel" element={<FuelLogsPage />} />
</Route>
```

---

## Step 3: Add a Navigation Link in the Layout

Each layout has its own nav item list. Find the array and add your entry.

### MobileLayout (`layouts/MobileLayout.tsx`)

Look for the `navItems` array and add:
```tsx
{ path: '/fuel-logs', icon: Fuel, label: 'Fuel', labelHi: 'ईंधन' }
```

### AgencyLayout (`layouts/AgencyLayout.tsx`)

Look for the sidebar nav items array:
```tsx
{ path: '/agency/fuel', icon: Fuel, label: 'Fuel Logs' }
```

### DriverLayout (`layouts/DriverLayout.tsx`)

Look for the bottom nav items:
```tsx
{ path: '/driver/fuel', icon: Fuel, label: 'Fuel' }
```

**Import the icon from `lucide-react`:**
```tsx
import { Fuel } from 'lucide-react'
```

---

## Step 4: Create Service Functions in `supabaseApi.ts`

Open `frontend/src/services/supabaseApi.ts`. Add your types and API object at the bottom of the file, following the established pattern.

```typescript
// ============= FUEL LOGS API =============
export interface FuelLog {
  id: string
  driver_id: string
  agency_id: string | null
  vehicle_number: string
  litres: number
  cost_per_litre: number
  total_cost: number
  odometer_km: number
  location: string | null
  receipt_url: string | null
  created_at?: string
  updated_at?: string
}

export const fuelLogsApi = {
  async getAll(): Promise<FuelLog[]> {
    const { data, error } = await supabase
      .from('fuel_logs')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as FuelLog[]) || []
  },

  async getByDriver(driverId: string): Promise<FuelLog[]> {
    const { data, error } = await supabase
      .from('fuel_logs')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as FuelLog[]) || []
  },

  async create(log: Omit<FuelLog, 'id' | 'created_at' | 'updated_at'>): Promise<FuelLog> {
    const { data, error } = await supabase
      .from('fuel_logs')
      .insert(log)
      .select()
      .single()
    if (error) throw error
    return data as FuelLog
  },

  async update(id: string, log: Partial<FuelLog>): Promise<FuelLog> {
    const { data, error } = await supabase
      .from('fuel_logs')
      .update(log)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as FuelLog
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('fuel_logs').delete().eq('id', id)
    if (error) throw error
  }
}
```

**Rule**: If you are creating a standalone service with more than ~5 functions or external API calls, create a new file (e.g. `frontend/src/services/fuelApi.ts`) instead of adding to `supabaseApi.ts`.

---

## Step 5: Create the Supabase Table with RLS

### 5a. Generate a migration file:

```powershell
cd supabase
npx supabase migration new add_fuel_logs_table
```

This creates `supabase/migrations/<timestamp>_add_fuel_logs_table.sql`.

### 5b. Write the migration SQL:

```sql
-- supabase/migrations/<timestamp>_add_fuel_logs_table.sql

CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  agency_id      uuid REFERENCES public.transport_agencies(id) ON DELETE SET NULL,
  vehicle_number text NOT NULL,
  litres         numeric(8,2) NOT NULL CHECK (litres > 0),
  cost_per_litre numeric(8,2) NOT NULL CHECK (cost_per_litre > 0),
  total_cost     numeric(10,2) GENERATED ALWAYS AS (litres * cost_per_litre) STORED,
  odometer_km    integer NOT NULL CHECK (odometer_km >= 0),
  location       text,
  receipt_url    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (REQUIRED — never leave a table without RLS)
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;

-- Drivers can read and write their own logs
CREATE POLICY "fuel_logs_driver_select"
  ON public.fuel_logs FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_logs_driver_insert"
  ON public.fuel_logs FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_logs_driver_update"
  ON public.fuel_logs FOR UPDATE
  USING (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

-- Agency can read logs for their own drivers
CREATE POLICY "fuel_logs_agency_select"
  ON public.fuel_logs FOR SELECT
  USING (
    agency_id IN (
      SELECT id FROM public.transport_agencies WHERE user_id = auth.uid()
    )
  );

-- Admin can read all
CREATE POLICY "fuel_logs_admin_select"
  ON public.fuel_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for common query pattern
CREATE INDEX idx_fuel_logs_driver_id ON public.fuel_logs(driver_id);
CREATE INDEX idx_fuel_logs_created_at ON public.fuel_logs(created_at DESC);
```

### 5c. Apply the migration:

```powershell
# Push to your linked Supabase project
npx supabase db push

# Or apply to local dev DB
npx supabase db reset
```

### RLS Policy Template (copy for any new table)

```sql
-- Minimum RLS setup for any user-owned table
ALTER TABLE public.<your_table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_owner_select" ON public.<your_table>
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "<table>_owner_insert" ON public.<your_table>
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "<table>_owner_update" ON public.<your_table>
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "<table>_owner_delete" ON public.<your_table>
  FOR DELETE USING (user_id = auth.uid());
```

**Never use `USING (true)` in production** — this bypasses RLS entirely and exposes all rows to all authenticated users. See known issues BUG-RLS-001 through BUG-RLS-006 in `docs/API_REFERENCE.md`.

---

## Step 6: Update PATTERNS.md

Open `0.dev-matrix/PATTERNS.md` and add any new patterns your module introduces. Common additions:

- A new data-fetching pattern (e.g. paginated list)
- A new form submission pattern with validation
- A new Realtime subscription pattern
- A new file upload pattern

---

## Step 7: Testing Checklist

Before marking the feature done, verify each item:

### Unit / Integration
- [ ] Page renders without console errors in dev mode
- [ ] Empty state renders correctly when table has no rows
- [ ] Loading skeleton shows during data fetch
- [ ] Error toast appears with a friendly message (not raw Supabase error) when the table query fails
- [ ] Create form validates required fields client-side before calling the API
- [ ] Delete confirmation prompt appears before `supabase.from().delete()`

### Auth & Role
- [ ] Direct URL navigation to the route without authentication redirects to `/login`
- [ ] A user with the wrong role (e.g. `driver` visiting `/agency/fuel`) is redirected
- [ ] The page uses `useAuthStore()` to get `user`, `agencyId`, or `driverId` — NOT local state

### RLS
- [ ] User A cannot read User B's rows (test in Supabase Table Editor with different JWT)
- [ ] RLS policies cover SELECT, INSERT, UPDATE, DELETE as applicable
- [ ] `USING (true)` is NOT present in any policy

### Build
- [ ] `cd frontend && npm run build` passes with 0 errors
- [ ] No TypeScript errors in the new files (`npx tsc --noEmit`)

### Smoke Test
- [ ] `npm run launch-check` still passes all gates

---

## Complete Working Page Template

Copy this as a starting point for any new CRUD page:

```tsx
import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import { logger } from '../utils/logger'
// import { fuelLogsApi, type FuelLog } from '../services/supabaseApi'

// REPLACE with your actual types and API import:
interface FuelLog {
  id: string
  vehicle_number: string
  litres: number
  total_cost: number
  created_at?: string
}

const fuelLogsApi = {
  getAll: async (): Promise<FuelLog[]> => [],
  create: async (log: Omit<FuelLog, 'id' | 'created_at'>): Promise<FuelLog> => ({ id: '', ...log }),
  delete: async (_id: string): Promise<void> => {},
}

export default function FuelLogsPage() {
  const { user } = useAuthStore()
  const [logs, setLogs] = useState<FuelLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // ---- Data load ----
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      try {
        const data = await fuelLogsApi.getAll()
        setLogs(data)
      } catch (err) {
        logger.error('[FuelLogsPage] load:', err)
        toast.error(toUserFacingErrorMessage(err, 'Could not load fuel logs. Please try again.'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  // ---- Delete ----
  async function handleDelete(id: string) {
    if (!window.confirm('Delete this fuel log?')) return
    try {
      await fuelLogsApi.delete(id)
      setLogs(prev => prev.filter(l => l.id !== id))
      toast.success('Fuel log deleted.')
    } catch (err) {
      logger.error('[FuelLogsPage] delete:', err)
      toast.error(toUserFacingErrorMessage(err, 'Could not delete. Please try again.'))
    }
  }

  // ---- Render ----
  if (loading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Fuel Logs</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Log
        </button>
      </div>

      {/* Empty state */}
      {logs.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">No fuel logs yet</p>
          <p className="text-sm mt-1">Add your first log to start tracking fuel costs.</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {logs.map(log => (
          <div
            key={log.id}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
          >
            <div>
              <p className="font-medium text-gray-900">{log.vehicle_number}</p>
              <p className="text-sm text-gray-500">
                {log.litres}L · ₹{log.total_cost.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(log.id)}
                className="p-2 text-gray-400 hover:text-red-600 rounded"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* TODO: replace with your actual modal/form component */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Add Fuel Log</h2>
            {/* Form fields here */}
            <button
              onClick={() => setShowForm(false)}
              className="mt-4 w-full py-2 border border-gray-300 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```
