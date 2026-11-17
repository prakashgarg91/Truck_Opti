import { useNavigate } from 'react-router-dom'
import BillingBanner from './BillingBanner'
import { useBillingGate } from './BillingGate'

/**
 * Shared banner for the agency layout (mounted once). Renders nothing while
 * loading, when the RPC errors, or for status none/active: no flash, no break.
 */
export default function AgencyBillingBanner() {
  const navigate = useNavigate()
  const { view, loading } = useBillingGate()
  if (loading || !view || !view.banner) return null
  return (
    <div className="px-4 pt-4 md:px-8 md:pt-6" data-testid="agency-billing-banner">
      <BillingBanner view={view} onAction={() => navigate('/subscription')} />
    </div>
  )
}
