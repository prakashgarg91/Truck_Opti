import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Zap, Crown, Building2, Rocket, Star, ChevronRight, ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PRICING_TIERS, type PricingTier } from '../config/pricing'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSubscription } from '../hooks/useSubscription'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

// ── Data fetcher ────────────────────────────────────────────────────────────
const fetchPricingPlans = async (): Promise<PricingTier[]> => {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('price_monthly', { ascending: true })
  if (error || !data || data.length === 0) return PRICING_TIERS
  return data.map((plan) => ({
    id: plan.id, name: plan.name, nameHi: plan.name_hi || plan.name,
    monthlyPrice: plan.price_monthly, yearlyPrice: plan.price_yearly,
    features: plan.features || [],
    limits: {
      users: plan.limits_users || 1,
      trucksManaged: plan.limits_trucks || 1,
      shipmentsPerMonth: plan.limits_shipments || 0,
      packingOptimizations: plan.limits_packing || 0,
      routeOptimizations: plan.limits_routes || 0,
      storageGB: plan.limits_storage || 1,
      apiCallsPerMonth: plan.limits_api_calls || 0,
      smsOtpPerMonth: plan.limits_sms || 0,
      supportLevel: plan.limits_support || 'community',
    },
    targetAudience: plan.target_audience || '',
  }))
}

// ── i18n ────────────────────────────────────────────────────────────────────
const LABELS = {
  eyebrow: 'Plans & Billing',
  title: 'Choose Your Plan', subtitle: 'Smart logistics optimization for every business size',
  planNote: 'Start free, switch billing cadence when you need to, and move enterprise fleets to tailored onboarding only when scale demands it.',
  summaryEyebrow: 'What changes by plan',
  summaryTitle: 'Capacity grows with your users, trucks, and shipment volume.',
  summarySubtitle: 'Every tier keeps the same core workflow: packing, dispatch, tracking, and billing. Upgrade only when usage expands.',
  highlightFree: 'No card required for the free tier',
  highlightBilling: 'Monthly and yearly billing available',
  highlightScale: 'Enterprise rollout support for larger fleets',
  monthly: 'Monthly', yearly: 'Yearly', saveTag: 'Save 17%',
  perMonth: '/mo', perYear: '/yr',
  getStarted: 'Get Started', contactSales: 'Contact Sales', startFree: 'Start Free →',
  mostPopular: 'Most Popular', currentPlan: 'Your Plan',
  upgrade: 'Upgrade', downgrade: 'Downgrade',
  users: 'Users', trucks: 'Trucks', shipments: 'Shipments/mo',
  packing: 'Packing Opts', routes: 'Route Opts',
  storage: 'Storage', apiCalls: 'API Calls/mo', sms: 'SMS OTP/mo',
  support: 'Support', unlimited: 'Unlimited',
  compareTitle: 'Full Feature Comparison',
  compareNote: 'Compare the limits before you lock a billing cycle.',
  freeForever: 'Start for Free', freeDesc: 'No credit card required. Full access to free tier.',
  enterprise: 'Need a custom plan?',
  enterpriseDesc: 'Large fleet or multiple locations? Get a tailored quote from our team.',
  talkToUs: 'Talk to Our Team',
  adminBadge: '⚡ Admin — All features unlocked',
  back: 'Back',
}

const TIER_CFG: Record<string, { icon: React.ComponentType<{ className?: string }>, grad: string, bg: string, txt: string }> = {
  starter: { icon: Rocket, grad: 'from-blue-500 to-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', txt: 'text-blue-700 dark:text-blue-300' },
  growth: { icon: Zap, grad: 'from-emerald-500 to-green-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', txt: 'text-emerald-700 dark:text-emerald-300' },
  professional: { icon: Star, grad: 'from-violet-500 to-purple-600', bg: 'bg-violet-50 dark:bg-violet-900/20', txt: 'text-violet-700 dark:text-violet-300' },
  enterprise: { icon: Crown, grad: 'from-orange-500 to-amber-600', bg: 'bg-orange-50 dark:bg-orange-900/20', txt: 'text-orange-700 dark:text-orange-300' },
}

const fmtINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const fmtLimit = (v: number | string, unlimited: string) => {
  if (typeof v === 'string') return v
  if (v === -1 || v === 0) return unlimited
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`
  return String(v)
}

// ── PricingCard ─────────────────────────────────────────────────────────────
interface CardProps {
  tier: PricingTier
  isYearly: boolean
  L: typeof LABELS
  isCurrent: boolean
  isUpgrade: boolean
  isDowngrade: boolean
  className?: string
  onCta: () => void
}
function PricingCard({ tier, isYearly, L, isCurrent, isUpgrade, isDowngrade, className = '', onCta }: CardProps) {
  const cfg = TIER_CFG[tier.id] || TIER_CFG.starter
  const Icon = cfg.icon
  const isPopular = tier.id === 'growth'
  const price = isYearly ? tier.yearlyPrice : tier.monthlyPrice
  const hasBadge = isPopular || isCurrent

  // Determine CTA button content and style
  const getCtaContent = () => {
    if (tier.id === 'enterprise') return L.contactSales
    if (isCurrent) return L.currentPlan
    if (isUpgrade) return L.upgrade
    if (isDowngrade) return L.downgrade
    return L.getStarted
  }

  const isCtaDisabled = isCurrent

  const getCtaClass = () => {
    if (tier.id === 'enterprise') {
      return 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800'
    }
    if (isCurrent) {
      return 'bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed'
    }
    if (isUpgrade) {
      return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90 shadow-sm'
    }
    if (isDowngrade) {
      return 'bg-white dark:bg-slate-700 border-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
    }
    return `bg-gradient-to-r ${cfg.grad} text-white hover:opacity-90 shadow-sm`
  }

  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border-2 bg-white/90 backdrop-blur-sm transition-all duration-300
      ${isPopular && !isCurrent ? 'border-emerald-500 dark:border-emerald-400 shadow-xl shadow-emerald-500/10' : isCurrent ? 'border-blue-500 dark:border-blue-400 shadow-xl shadow-blue-500/10' : 'border-slate-200 dark:border-slate-700'}
      hover:-translate-y-1 hover:shadow-2xl ${className}`}
    >
      {/* Top badge strip */}
      {hasBadge && (
        <div className={`text-center text-[11px] font-bold py-1.5 uppercase tracking-widest
          ${isCurrent ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white'}`}>
          {isCurrent ? L.currentPlan : L.mostPopular}
        </div>
      )}

      <div className="flex flex-col flex-1 p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${cfg.grad} text-white shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-tight break-words">
              {tier.name}
            </div>
            {tier.targetAudience && (
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight line-clamp-2 sm:line-clamp-1">{tier.targetAudience}</div>
            )}
          </div>
        </div>

        {/* Price block */}
        <div className={`rounded-xl p-4 mb-4 ${cfg.bg}`}>
          <div className="flex items-end gap-1 flex-wrap">
            <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${cfg.txt}`}>{fmtINR(price)}</span>
            <span className="text-sm text-slate-500 mb-1">{isYearly ? L.perYear : L.perMonth}</span>
          </div>
          {isYearly && tier.monthlyPrice > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
              Save {fmtINR(tier.monthlyPrice * 12 - tier.yearlyPrice)} vs monthly
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onCta}
          disabled={isCtaDisabled}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all mb-4 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${getCtaClass()}`}
        >
          {getCtaContent()}
        </button>

        {/* Key limits */}
        <div className="space-y-2 mb-4">
          {([
            [L.trucks, tier.limits.trucksManaged],
            [L.shipments, tier.limits.shipmentsPerMonth],
            [L.packing, tier.limits.packingOptimizations],
            [L.users, tier.limits.users],
          ] as [string, number][]).map(([label, val]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">{label}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{fmtLimit(val, L.unlimited)}</span>
            </div>
          ))}
        </div>

        {/* Features */}
        {tier.features.length > 0 && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 mt-auto">
            <ul className="space-y-2">
              {tier.features.slice(0, 5).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Check className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.txt}`} />
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function PricingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { subscription, plan: currentPlan, refetch } = useSubscription()
  const isAdmin = user?.role === 'admin'

  const [isYearly, setIsYearly] = useState(false)
  const [activeIdx, setActiveIdx] = useState(1)
  const [updating, setUpdating] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const L = LABELS

  useEffect(() => { document.title = 'Pricing — TruckOpti' }, [])

  // Handle plan upgrade/downgrade
  const handlePlanChange = async (tierId: string) => {
    if (!subscription?.id || updating) return

    setUpdating(tierId)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ plan_id: tierId })
        .eq('id', subscription.id)

      if (error) {
        logger.error('[PricingPage] Plan update error:', error)
        toast.error('Failed to update plan')
        return
      }

      toast.success('Plan updated successfully!')
      refetch()
    } finally {
      setUpdating(null)
    }
  }

  const { data: tiers = PRICING_TIERS, isLoading } = useQuery<PricingTier[]>({
    queryKey: ['pricing-plans'], queryFn: fetchPricingPlans,
    staleTime: 1000 * 60 * 5, initialData: PRICING_TIERS,
  })

  // Determine current tier index (based on price order - lowest first)
  const currentTierIndex = currentPlan
    ? tiers.findIndex(t => t.id === currentPlan.id)
    : -1

  // Determine if each tier is upgrade or downgrade
  const getTierRelation = (tierIndex: number) => {
    if (!subscription || currentTierIndex === -1) return { isUpgrade: false, isDowngrade: false }
    if (tierIndex > currentTierIndex) return { isUpgrade: true, isDowngrade: false }
    if (tierIndex < currentTierIndex) return { isUpgrade: false, isDowngrade: true }
    return { isUpgrade: false, isDowngrade: false }
  }

  const scrollToCard = (idx: number) => {
    const el = scrollRef.current?.children[idx] as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    setActiveIdx(idx)
  }

  const handleScroll = () => {
    const c = scrollRef.current
    if (!c) return
    let closest = 0, min = Infinity
    Array.from(c.children).forEach((child, i) => {
      const el = child as HTMLElement
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - (c.scrollLeft + c.clientWidth / 2))
      if (dist < min) { min = dist; closest = i }
    })
    setActiveIdx(closest)
  }

  const COMPARE_ROWS: { label: string; key: keyof PricingTier['limits'] }[] = [
    { label: L.users, key: 'users' },
    { label: L.trucks, key: 'trucksManaged' },
    { label: L.shipments, key: 'shipmentsPerMonth' },
    { label: L.packing, key: 'packingOptimizations' },
    { label: L.routes, key: 'routeOptimizations' },
    { label: L.storage, key: 'storageGB' },
    { label: L.apiCalls, key: 'apiCallsPerMonth' },
    { label: L.sms, key: 'smsOtpPerMonth' },
    { label: L.support, key: 'supportLevel' },
  ]

  const planHighlights = [L.highlightFree, L.highlightBilling, L.highlightScale]

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#ffffff_44%,#eef4ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary-100/60 via-primary-50/20 to-transparent dark:from-primary-950/50 dark:via-primary-950/10 dark:to-transparent" />
      <div className="pointer-events-none absolute -left-20 top-28 h-56 w-56 rounded-full bg-primary-300/15 blur-3xl dark:bg-primary-500/15" />
      <div className="pointer-events-none absolute right-0 top-36 h-72 w-72 rounded-full bg-orange-300/15 blur-3xl dark:bg-orange-500/10" />

      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {L.back}
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Billing toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm">
              <button
                onClick={() => setIsYearly(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all text-xs sm:text-sm ${!isYearly ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >{L.monthly}</button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1 text-xs sm:text-sm ${isYearly ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                {L.yearly}
                <span className="hidden sm:inline text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">{L.saveTag}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8 pb-20">

        {/* Header */}
        <div className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-start">
          <div className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/90 p-7 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-orange-400 to-emerald-500" />
            <div className="inline-flex items-center rounded-full border border-primary-200/80 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 dark:border-primary-800/80 dark:bg-primary-950/40 dark:text-primary-300">
              {L.eyebrow}
            </div>
            <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl lg:text-5xl">
              {L.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              {L.subtitle}
            </p>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              {L.planNote}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {isAdmin && (
                <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  {L.adminBadge}
                </div>
              )}
              {isYearly && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  🎉 {L.saveTag} on yearly billing
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] bg-slate-900 p-6 text-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.75)] dark:bg-slate-950 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-300">{L.summaryEyebrow}</p>
            <h2 className="mt-4 text-2xl font-bold leading-tight">{L.summaryTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{L.summarySubtitle}</p>

            <div className="mt-6 space-y-3">
              {planHighlights.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="mt-0.5 rounded-full bg-primary-500/20 p-1 text-primary-200">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{item}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('/contact')}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100"
            >
              {L.talkToUs}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Free banner */}
        <div className="mb-10 overflow-hidden rounded-[28px] bg-gradient-to-r from-primary-500 via-primary-600 to-orange-500 p-px shadow-lg shadow-primary-500/10">
          <div className="rounded-[27px] bg-white/95 p-6 dark:bg-slate-900/95 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-primary-600 dark:text-primary-300">{L.freeForever}</p>
                <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{L.freeDesc}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{L.compareNote}</p>
              </div>
              <button
                onClick={() => navigate('/signup')}
                className="shrink-0 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-700 active:scale-95"
              >{L.startFree}</button>
            </div>
          </div>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 animate-pulse space-y-3 h-80" />
            ))}
          </div>
        ) : (
          <>
            {/* Mobile: snap scroll */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="lg:hidden flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-4"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {tiers.map((tier, idx) => {
                const { isUpgrade, isDowngrade } = getTierRelation(idx)
                return (
                  <PricingCard
                    key={tier.id} tier={tier} isYearly={isYearly} L={L}
                    isCurrent={currentPlan?.id === tier.id}
                    isUpgrade={isUpgrade}
                    isDowngrade={isDowngrade}
                    className="snap-center shrink-0 w-[88vw] max-w-sm sm:w-[55vw]"
                    onCta={() => {
                      if (tier.id === 'enterprise') {
                        navigate('/contact')
                      } else if (subscription && (isUpgrade || isDowngrade)) {
                        handlePlanChange(tier.id)
                      } else {
                        navigate('/signup')
                      }
                    }}
                  />
                )
              })}
            </div>

            {/* Mobile dots */}
            <div className="lg:hidden flex justify-center gap-2 mt-2 mb-6">
              {tiers.map((_, i) => (
                <button
                  key={i} onClick={() => scrollToCard(i)}
                  className={`rounded-full transition-all duration-200 ${i === activeIdx ? 'w-6 h-2.5 bg-blue-500' : 'w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600'}`}
                />
              ))}
            </div>

            {/* Desktop grid */}
            <div className="hidden lg:grid grid-cols-4 gap-6 items-stretch">
              {tiers.map((tier, idx) => {
                const { isUpgrade, isDowngrade } = getTierRelation(idx)
                return (
                  <PricingCard
                    key={tier.id} tier={tier} isYearly={isYearly} L={L}
                    isCurrent={currentPlan?.id === tier.id}
                    isUpgrade={isUpgrade}
                    isDowngrade={isDowngrade}
                    onCta={() => {
                      if (tier.id === 'enterprise') {
                        navigate('/contact')
                      } else if (subscription && (isUpgrade || isDowngrade)) {
                        handlePlanChange(tier.id)
                      } else {
                        navigate('/signup')
                      }
                    }}
                  />
                )
              })}
            </div>
          </>
        )}

        {/* Comparison table */}
        {!isLoading && tiers.length > 0 && (
          <div className="mt-16">
            <div className="mx-auto mb-6 max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{L.compareTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{L.compareNote}</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    <th className="py-4 px-5 text-left text-slate-500 font-medium w-36 sm:w-44">Feature</th>
                    {tiers.map((tier) => {
                      const cfg = TIER_CFG[tier.id] || TIER_CFG.starter
                      const Icon = cfg.icon
                      return (
                        <th key={tier.id} className="py-4 px-3 text-center">
                          <div className={`inline-flex flex-col items-center gap-1 px-2 py-2 rounded-xl ${cfg.bg}`}>
                            <Icon className={`w-4 h-4 ${cfg.txt}`} />
                            <span className={`text-[11px] font-bold ${cfg.txt} whitespace-nowrap`}>{tier.name}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, i) => (
                    <tr key={row.key} className={`border-b border-slate-100 dark:border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''}`}>
                      <td className="py-3 px-5 text-slate-600 dark:text-slate-400 font-medium">{row.label}</td>
                      {tiers.map((tier) => {
                        const val = tier.limits[row.key]
                        return (
                          <td key={tier.id} className="py-3 px-3 text-center font-semibold text-slate-900 dark:text-white">
                            {fmtLimit(val as number | string, L.unlimited)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {/* Price row */}
                  <tr className="border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-800/40">
                    <td className="py-3 px-5 text-slate-600 dark:text-slate-400 font-medium">Price/month</td>
                    {tiers.map((tier) => (
                      <td key={tier.id} className="py-3 px-3 text-center font-bold text-slate-900 dark:text-white">
                        {fmtINR(isYearly ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice)}
                      </td>
                    ))}
                  </tr>
                  {/* CTA row */}
                  <tr>
                    <td className="py-5 px-5" />
                    {tiers.map((tier) => {
                      const cfg = TIER_CFG[tier.id] || TIER_CFG.starter
                      return (
                        <td key={tier.id} className="py-5 px-3 text-center">
                          <button
                            onClick={() => tier.id === 'enterprise' ? navigate('/contact') : navigate('/signup')}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r ${cfg.grad} hover:opacity-90 transition-opacity active:scale-95`}
                          >{tier.id === 'enterprise' ? L.contactSales : L.getStarted}</button>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Enterprise CTA */}
        <div className="mt-14 rounded-[32px] bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-8 text-center shadow-2xl shadow-slate-900/20 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-orange-400">
            <Building2 className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-white sm:text-2xl">{L.enterprise}</h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-300 sm:text-base">{L.enterpriseDesc}</p>
          <button
            onClick={() => (window.location.href = 'mailto:sales@truckopti.in')}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100"
          >
            {L.talkToUs} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
