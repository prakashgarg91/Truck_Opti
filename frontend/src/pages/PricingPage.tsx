import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Zap, Crown, Building2, Rocket, Star, Globe, ChevronRight, ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PRICING_TIERS, type PricingTier } from '../config/pricing'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSubscription } from '../hooks/useSubscription'

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
type Language = 'en' | 'hi'
const LABELS = {
  en: {
    title: 'Choose Your Plan', subtitle: 'Smart logistics optimization for every business size',
    monthly: 'Monthly', yearly: 'Yearly', saveTag: 'Save 17%',
    perMonth: '/mo', perYear: '/yr',
    getStarted: 'Get Started', contactSales: 'Contact Sales', startFree: 'Start Free →',
    mostPopular: 'Most Popular', currentPlan: 'Your Plan',
    users: 'Users', trucks: 'Trucks', shipments: 'Shipments/mo',
    packing: 'Packing Opts', routes: 'Route Opts',
    storage: 'Storage', apiCalls: 'API Calls/mo', sms: 'SMS OTP/mo',
    support: 'Support', unlimited: 'Unlimited',
    compareTitle: 'Full Feature Comparison',
    freeForever: 'Start for Free', freeDesc: 'No credit card required. Full access to free tier.',
    enterprise: 'Need a custom plan?',
    enterpriseDesc: 'Large fleet or multiple locations? Get a tailored quote from our team.',
    talkToUs: 'Talk to Our Team',
    adminBadge: '⚡ Admin — All features unlocked',
    back: 'Back',
  },
  hi: {
    title: 'अपना प्लान चुनें', subtitle: 'हर व्यवसाय के लिए स्मार्ट लॉजिस्टिक्स',
    monthly: 'मासिक', yearly: 'वार्षिक', saveTag: '17% बचाएं',
    perMonth: '/माह', perYear: '/वर्ष',
    getStarted: 'शुरू करें', contactSales: 'संपर्क करें', startFree: 'मुफ्त शुरू करें →',
    mostPopular: 'सबसे लोकप्रिय', currentPlan: 'आपका प्लान',
    users: 'यूज़र्स', trucks: 'ट्रक', shipments: 'शिपमेंट/माह',
    packing: 'पैकिंग ऑप्ट', routes: 'रूट ऑप्ट',
    storage: 'स्टोरेज', apiCalls: 'API कॉल/माह', sms: 'SMS OTP/माह',
    support: 'सपोर्ट', unlimited: 'अनलिमिटेड',
    compareTitle: 'सभी सुविधाएं',
    freeForever: 'मुफ्त शुरू करें', freeDesc: 'कोई क्रेडिट कार्ड नहीं।',
    enterprise: 'कस्टम समाधान चाहिए?',
    enterpriseDesc: 'बड़े फ्लीट के लिए टेलर्ड प्लान।',
    talkToUs: 'हमसे बात करें',
    adminBadge: '⚡ एडमिन — सभी सुविधाएं अनलॉक',
    back: 'वापस',
  },
}

const TIER_CFG: Record<string, { icon: React.ComponentType<{ className?: string }>, grad: string, bg: string, txt: string }> = {
  starter:      { icon: Rocket, grad: 'from-blue-500 to-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20',     txt: 'text-blue-700 dark:text-blue-300' },
  growth:       { icon: Zap,    grad: 'from-emerald-500 to-green-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', txt: 'text-emerald-700 dark:text-emerald-300' },
  professional: { icon: Star,   grad: 'from-violet-500 to-purple-600', bg: 'bg-violet-50 dark:bg-violet-900/20',  txt: 'text-violet-700 dark:text-violet-300' },
  enterprise:   { icon: Crown,  grad: 'from-orange-500 to-amber-600',  bg: 'bg-orange-50 dark:bg-orange-900/20',  txt: 'text-orange-700 dark:text-orange-300' },
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
  lang: Language
  L: typeof LABELS['en']
  isCurrent: boolean
  className?: string
  onCta: () => void
}
function PricingCard({ tier, isYearly, lang, L, isCurrent, className = '', onCta }: CardProps) {
  const cfg = TIER_CFG[tier.id] || TIER_CFG.starter
  const Icon = cfg.icon
  const isPopular = tier.id === 'growth'
  const price = isYearly ? tier.yearlyPrice : tier.monthlyPrice
  const hasBadge = isPopular || isCurrent

  return (
    <div className={`relative flex flex-col rounded-2xl overflow-hidden border-2 bg-white dark:bg-slate-800 transition-shadow
      ${isPopular && !isCurrent ? 'border-emerald-500 dark:border-emerald-400 shadow-xl shadow-emerald-500/10' : isCurrent ? 'border-blue-500 dark:border-blue-400 shadow-xl shadow-blue-500/10' : 'border-slate-200 dark:border-slate-700'}
      hover:shadow-xl ${className}`}
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
            <div className="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-tight truncate">
              {lang === 'en' ? tier.name : tier.nameHi}
            </div>
            {tier.targetAudience && (
              <div className="text-[11px] text-slate-400 mt-0.5 leading-tight line-clamp-1">{tier.targetAudience}</div>
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
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all mb-4 active:scale-95
            ${tier.id === 'enterprise'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800'
              : `bg-gradient-to-r ${cfg.grad} text-white hover:opacity-90 shadow-sm`}`}
        >
          {tier.id === 'enterprise' ? L.contactSales : L.getStarted}
        </button>

        {/* Key limits */}
        <div className="space-y-2 mb-4">
          {([
            [L.trucks,    tier.limits.trucksManaged],
            [L.shipments, tier.limits.shipmentsPerMonth],
            [L.packing,   tier.limits.packingOptimizations],
            [L.users,     tier.limits.users],
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
                  <span>{f}</span>
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
  const { plan: currentPlan } = useSubscription()
  const isAdmin = user?.role === 'admin'

  const [lang, setLang] = useState<Language>('en')
  const [isYearly, setIsYearly] = useState(false)
  const [activeIdx, setActiveIdx] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const L = LABELS[lang]

  useEffect(() => { document.title = 'Pricing — TruckOpti' }, [])

  const { data: tiers = PRICING_TIERS, isLoading } = useQuery<PricingTier[]>({
    queryKey: ['pricing-plans'], queryFn: fetchPricingPlans,
    staleTime: 1000 * 60 * 5, initialData: PRICING_TIERS,
  })

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
    { label: L.users,     key: 'users' },
    { label: L.trucks,    key: 'trucksManaged' },
    { label: L.shipments, key: 'shipmentsPerMonth' },
    { label: L.packing,   key: 'packingOptimizations' },
    { label: L.routes,    key: 'routeOptimizations' },
    { label: L.storage,   key: 'storageGB' },
    { label: L.apiCalls,  key: 'apiCallsPerMonth' },
    { label: L.sms,       key: 'smsOtpPerMonth' },
    { label: L.support,   key: 'supportLevel' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">

      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 py-3">
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
            <button
              onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            ><Globe className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8 pb-20">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">{L.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-lg max-w-xl mx-auto">{L.subtitle}</p>
          {isAdmin && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-sm font-semibold">
              {L.adminBadge}
            </div>
          )}
          {isYearly && (
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-semibold ml-3">
              🎉 {L.saveTag} on yearly billing
            </div>
          )}
        </div>

        {/* Free banner */}
        <div className="mb-8 rounded-2xl overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 p-px">
          <div className="bg-blue-50 dark:bg-blue-950/50 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-base">{L.freeForever}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{L.freeDesc}</p>
            </div>
            <button
              onClick={() => navigate('/signup')}
              className="shrink-0 px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-95"
            >{L.startFree}</button>
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
              {tiers.map((tier) => (
                <PricingCard
                  key={tier.id} tier={tier} isYearly={isYearly} lang={lang} L={L}
                  isCurrent={currentPlan?.id === tier.id}
                  className="snap-center shrink-0 w-[82vw] sm:w-[55vw]"
                  onCta={() => tier.id === 'enterprise' ? navigate('/contact') : navigate('/signup')}
                />
              ))}
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
            <div className="hidden lg:grid grid-cols-4 gap-5 items-stretch">
              {tiers.map((tier) => (
                <PricingCard
                  key={tier.id} tier={tier} isYearly={isYearly} lang={lang} L={L}
                  isCurrent={currentPlan?.id === tier.id}
                  onCta={() => tier.id === 'enterprise' ? navigate('/contact') : navigate('/signup')}
                />
              ))}
            </div>
          </>
        )}

        {/* Comparison table */}
        {!isLoading && tiers.length > 0 && (
          <div className="mt-16">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-6">{L.compareTitle}</h2>
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
                            <span className={`text-[11px] font-bold ${cfg.txt} whitespace-nowrap`}>{lang === 'en' ? tier.name : tier.nameHi}</span>
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
        <div className="mt-12 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 p-8 sm:p-10 text-center">
          <Building2 className="w-10 h-10 text-orange-400 mx-auto mb-4" />
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">{L.enterprise}</h3>
          <p className="text-slate-300 text-sm sm:text-base mb-6 max-w-md mx-auto">{L.enterpriseDesc}</p>
          <button
            onClick={() => (window.location.href = 'mailto:sales@truckopti.in')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-xl font-semibold hover:bg-slate-100 transition-colors text-sm"
          >
            {L.talkToUs} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
