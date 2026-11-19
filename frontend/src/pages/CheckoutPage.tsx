import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, CheckCircle2, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { getRazorpayConfig } from '../services/razorpayPayment'
import {
  checkoutApi,
  entitlementApi,
  subscriptionPlansApi,
  type SubscriptionPlan,
} from '../services/subscriptionApi'
import {
  GST_NOTE,
  TWO_MONTHS_FREE,
  formatPlanPrice,
  pollForActivation,
  type Entitlement,
} from '../lib/billingState'
import { openRazorpayCheckout } from '../components/billing/razorpayCheckout'
import { PaymentSupportNotice } from '../components/billing/PaymentSupportNotice'
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS_RING } from '../components/billing/styles'
import { useEntitlement } from '../components/billing/useEntitlement'
import { logger } from '../utils/logger'
import { useAuthStore } from '../stores/authStore'
import { taxModeOf, useSellerGstRegistered } from '../hooks/useSellerGstRegistered'

type PlanTier = 'starter' | 'growth' | 'professional'
type Phase = 'form' | 'opening' | 'activating' | 'active' | 'timeout' | 'support'

const PAYABLE_TIERS: readonly PlanTier[] = ['starter', 'growth', 'professional']
const TIER_ORDER: Record<string, number> = { starter: 1, growth: 2, professional: 3, enterprise: 4 }

function isPayableTier(value: string | null): value is PlanTier {
  return value !== null && (PAYABLE_TIERS as readonly string[]).includes(value)
}

const INPUT_CLASS = `min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white ${FOCUS_RING}`
const CARD = 'rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-800'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { entitlement: current, refetch: refetchEntitlement } = useEntitlement()
  const sellerGst = useSellerGstRegistered()
  // The server quote, once an order exists, is the authority; before that, the platform flag.
  const [quoteGstRegistered, setQuoteGstRegistered] = useState<boolean | null>(null)
  const taxMode = quoteGstRegistered === null
    ? taxModeOf(sellerGst)
    : quoteGstRegistered ? 'registered' : 'unregistered'

  const tierParam = searchParams.get('plan')
  const billingCycle: 'monthly' | 'yearly' = searchParams.get('billing') === 'yearly' ? 'yearly' : 'monthly'

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [phase, setPhase] = useState<Phase>('form')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [coupon, setCoupon] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Set only when verify answers state "support": payment captured, not applied.
  const [supportNotice, setSupportNotice] = useState<{ message: string | null; paymentId: string | null }>({
    message: null,
    paymentId: null,
  })
  const cancelled = useRef(false)

  const razorpayConfig = getRazorpayConfig()
  const paymentUnavailable = !razorpayConfig.isCheckoutEnabled

  useEffect(() => {
    document.title = 'Checkout - TruckOpti'
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const loadPlan = useCallback(async () => {
    if (!isPayableTier(tierParam)) {
      // Enterprise is contact-only; anything else is not a plan.
      navigate(tierParam === 'enterprise' ? '/contact' : '/pricing', { replace: true })
      return
    }
    setLoadState('loading')
    try {
      const data = await subscriptionPlansApi.getByTier(tierParam)
      if (!data) {
        setLoadState('error')
        return
      }
      setPlan(data)
      setLoadState('ready')
    } catch (error) {
      logger.error('Error loading checkout plan:', error)
      setLoadState('error')
    }
  }, [tierParam, navigate])

  useEffect(() => {
    void loadPlan()
  }, [loadPlan])

  const handlePay = async () => {
    if (!plan || !isPayableTier(tierParam)) return
    if (phone.length !== 10) {
      setFormError('Enter a valid 10 digit mobile number.')
      return
    }
    if (paymentUnavailable) {
      setFormError('Payments are temporarily unavailable. Please contact support.')
      return
    }

    setFormError(null)
    setPhase('opening')

    // Snapshot before paying so a renewal or plan change can be told apart.
    let before: Entitlement | null = current ?? null
    try {
      before = await entitlementApi.get()
    } catch {
      // keep the cached snapshot
    }

    try {
      // Only plan, cycle and coupon are sent. The server prices and taxes.
      const order = await checkoutApi.createOrder({
        plan_tier: tierParam,
        billing_cycle: billingCycle,
        coupon_code: coupon,
      })
      if (typeof order.gst_registered === 'boolean') setQuoteGstRegistered(order.gst_registered)

      const outcome = await openRazorpayCheckout({
        keyId: razorpayConfig.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: `TruckOpti ${plan.name} - ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
        prefill: { name: user?.name || '', email, contact: phone },
      })

      if (outcome.kind === 'dismissed') {
        setPhase('form')
        return
      }
      if (outcome.kind === 'failed') {
        setFormError(outcome.message)
        setPhase('form')
        return
      }

      // The callback is not activation. Ask the server to verify, then watch
      // the entitlement until it says active.
      setPhase('activating')
      const verdict = await checkoutApi.verifyPayment(outcome.payload)
      if (verdict.kind === 'support') {
        // Not applied on the server: polling would only end in the "taking longer" screen.
        setSupportNotice({ message: verdict.message, paymentId: outcome.payload.razorpay_payment_id })
        setPhase('support')
        return
      }
      const result = await pollForActivation({
        fetchEntitlement: () => entitlementApi.get(),
        before,
        sleep,
        isCancelled: () => cancelled.current,
      })
      if (result === 'cancelled') return
      await refetchEntitlement()
      setPhase(result === 'activated' ? 'active' : 'timeout')
    } catch (error) {
      logger.error('Payment error:', error)
      setFormError(error instanceof Error && error.message ? error.message : 'Payment could not be started. Please try again.')
      setPhase('form')
    }
  }

  if (loadState === 'loading') {
    return (
      <div role="status" aria-label="Loading checkout" className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden="true" />
      </div>
    )
  }

  if (loadState === 'error' || !plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
        <div role="alert" className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-600" aria-hidden="true" />
          <p className="text-slate-700 dark:text-slate-200">We could not load this plan.</p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => void loadPlan()} className={BTN_PRIMARY}>Try again</button>
            <button type="button" onClick={() => navigate('/pricing')} className={BTN_SECONDARY}>View plans</button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'activating') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
        <div role="status" aria-live="polite" className={`${CARD} max-w-md text-center`}>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Payment received, activating</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            We are confirming your payment with the bank. This usually takes a few seconds. Please keep this page open.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'active') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
        <div role="status" className={`${CARD} max-w-md text-center`}>
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Your {plan.name} plan is active</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Thank you. Your invoice will be available under Subscription.</p>
          <button type="button" onClick={() => navigate('/subscription')} className={`${BTN_PRIMARY} mt-5`}>Go to subscription</button>
        </div>
      </div>
    )
  }

  if (phase === 'support') {
    return <PaymentSupportNotice message={supportNotice.message} paymentId={supportNotice.paymentId} />
  }

  if (phase === 'timeout') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
        <div role="status" className={`${CARD} max-w-md text-center`}>
          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">We have your payment</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Activation is taking longer than usual. You do not need to pay again. We will email you as soon as your plan is active. If you do not hear from us, contact support.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => navigate('/subscription')} className={BTN_PRIMARY}>Check subscription</button>
            <button type="button" onClick={() => navigate('/support')} className={BTN_SECONDARY}>Contact support</button>
          </div>
        </div>
      </div>
    )
  }

  const listPrice = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
  const busy = phase === 'opening'
  const currentTier = current?.planTier ?? null
  const isLiveChange = current?.status === 'active' && currentTier !== null && currentTier !== plan.tier
  const change = isLiveChange
    ? (TIER_ORDER[plan.tier] ?? 0) > (TIER_ORDER[currentTier] ?? 0) ? 'upgrade' : 'downgrade'
    : null

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-900">
      <div className="mx-auto max-w-4xl">
        {razorpayConfig.isTestMode && (
          <div role="status" className="mb-6 flex items-center gap-2 rounded-lg border border-yellow-400 bg-yellow-100 px-4 py-3 text-yellow-900">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Test mode is active. Use sandbox credentials only; no live payment will be captured.</span>
          </div>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          <section className={CARD} aria-labelledby="order-summary-heading">
            <h1 id="order-summary-heading" className="mb-6 text-xl font-bold text-slate-900 dark:text-white">Order summary</h1>

            {change && (
              <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
                {change === 'upgrade'
                  ? `You are upgrading to ${plan.name}. The new limits apply once your payment is confirmed.`
                  : `You are moving to ${plan.name}. Review the lower limits before you continue.`}
              </p>
            )}

            <div className="mb-4 flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">{plan.name} plan</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {billingCycle === 'yearly' ? `Yearly (${TWO_MONTHS_FREE})` : 'Monthly'}
                </p>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatPlanPrice(listPrice)}
                <span className="block text-right text-xs font-normal text-slate-600 dark:text-slate-300">
                  {taxMode === 'registered' ? 'excl. GST' : taxMode === 'unregistered' ? 'No GST charged' : 'Before tax'}
                </span>
              </span>
            </div>

            <ul className="mb-6 space-y-2" aria-label="Included features">
              {plan.features.slice(0, 5).map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  {feature.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>

            <p className="border-t border-slate-200 pt-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
              {taxMode === 'registered'
                ? `${GST_NOTE}. The final amount, including GST and any coupon, is calculated securely and shown in the payment window before you pay.`
                : taxMode === 'unregistered'
                  ? 'No GST charged. The final amount, including any coupon, is calculated securely and shown in the payment window before you pay.'
                  : 'Taxes, if any, are shown at checkout. The final amount, including any coupon, is calculated securely and shown in the payment window before you pay.'}
            </p>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
              See our <Link to="/terms" className={`font-semibold text-indigo-700 underline dark:text-indigo-300 ${FOCUS_RING}`}>refund policy</Link>.
            </p>
          </section>

          <section className={CARD} aria-labelledby="payment-details-heading">
            <h2 id="payment-details-heading" className="mb-6 text-xl font-bold text-slate-900 dark:text-white">Payment details</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="checkout-phone" className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Mobile number *</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" aria-hidden="true">+91</span>
                  <input
                    id="checkout-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className={`${INPUT_CLASS} pl-12`}
                    aria-describedby="checkout-phone-help"
                  />
                </div>
                <p id="checkout-phone-help" className="mt-1 text-xs text-slate-600 dark:text-slate-300">Used by the payment window for UPI and bank confirmation.</p>
              </div>

              <div>
                <label htmlFor="checkout-email" className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Email address</label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="checkout-coupon" className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200">Coupon code (optional)</label>
                <input
                  id="checkout-coupon"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
                  className={INPUT_CLASS}
                  aria-describedby="checkout-coupon-help"
                />
                <p id="checkout-coupon-help" className="mt-1 text-xs text-slate-600 dark:text-slate-300">Checked on our server when you pay.</p>
              </div>

              <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                <Smartphone className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                Pay with UPI, cards or net banking through Razorpay.
              </p>

              {paymentUnavailable && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Live payments are temporarily unavailable. Please contact support before trying again.
                </div>
              )}

              {formError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</div>
              )}

              <button
                type="button"
                onClick={() => void handlePay()}
                disabled={busy || phone.length !== 10 || paymentUnavailable}
                className={`${BTN_PRIMARY} w-full !min-h-[52px]`}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Preparing payment...
                  </>
                ) : (
                  'Continue to payment'
                )}
              </button>

              <p className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                Payments are completed on the secure gateway. TruckOpti never asks for your UPI PIN.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
