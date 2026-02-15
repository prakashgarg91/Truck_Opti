import { usageApi } from '../services/subscriptionApi'
import toast from 'react-hot-toast'

export function useSubscription() {
  const checkLimit = async (feature: string): Promise<boolean> => {
    try {
      // Map feature names to API resource types
      const resourceMap: Record<string, 'shipments' | 'api_calls' | 'sms' | 'maps'> = {
        'packing_optimizations': 'shipments',
        'shipments': 'shipments',
        'api_calls': 'api_calls',
        'sms': 'sms',
        'maps': 'maps'
      }

      const resource = resourceMap[feature] || 'shipments'
      const result = await usageApi.canUse(resource)
      return result
    } catch {
      // If check fails, allow action (fail open for now)
      return true
    }
  }

  const showUpgradePrompt = (feature: string) => {
    toast.error(`You've reached your plan limit for ${feature}. Upgrade your plan to continue.`)
  }

  return { checkLimit, showUpgradePrompt }
}
