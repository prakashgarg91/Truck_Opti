/**
 * TO-139 — safe display-name extraction for auth metadata.
 *
 * `user_metadata.company` is not guaranteed to be a string: the device-local
 * agency profile stores `{ name: company_name }` (authStore.loginLocal), and
 * cloud signup metadata has used the same shape. Rendering that object as a
 * React child throws "Objects are not valid as a React child" (React error
 * #31) and collapses the whole layout, so every surface must normalize it
 * before rendering.
 */
export function toDisplayName(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name
    if (typeof name === 'string') {
      const trimmed = name.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }

  return null
}
