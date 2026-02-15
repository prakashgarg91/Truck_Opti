import { useState, useEffect } from 'react'
import { Check, Zap, Crown, Building2, Rocket, Star, Globe } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PRICING_TIERS, type PricingTier } from '../config/pricing'
import { supabase } from '../lib/supabase'

// Fetch pricing plans from database
const fetchPricingPlans = async (): Promise<PricingTier[]> => {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('price_monthly', { ascending: true })

  if (error || !data || data.length === 0) {
    // Fall back to static pricing tiers
    return PRICING_TIERS
  }

  // Map database rows to PricingTier interface
  return data.map((plan) => ({
    id: plan.id,
    name: plan.name,
    nameHi: plan.name_hi || plan.name,
    monthlyPrice: plan.price_monthly,
    yearlyPrice: plan.price_yearly,
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
      supportLevel: plan.limits_support || 'community'
    },
    targetAudience: plan.target_audience || ''
  }))
}

type Language = 'en' | 'hi'

const t = {
  en: {
    title: 'Simple, Transparent Pricing',
    subtitle: 'Choose the plan that fits your logistics needs',
    monthly: 'Monthly',
    yearly: 'Yearly',
    savePercent: 'Save 17%',
    perMonth: '/month',
    perYear: '/year',
    startFreeTrial: 'Start 14-Day Free Trial',
    getStarted: 'Get Started',
    contactSales: 'Contact Sales',
    currentPlan: 'Current Plan',
    mostPopular: 'Most Popular',
    features: 'Features',
    limits: 'Usage Limits',
    users: 'Users',
    trucks: 'Trucks Managed',
    shipments: 'Shipments/Month',
    packing: 'Packing Optimizations',
    routes: 'Route Optimizations',
    storage: 'Storage',
    apiCalls: 'API Calls/Month',
    smsOtp: 'SMS OTP/Month',
    support: 'Support',
    unlimited: 'Unlimited',
    addOns: 'Add-Ons',
    freeForever: 'Free Forever Plan',
    freeFeatures: 'Perfect for trying out TruckOpti',
    startFree: 'Start Free',
    enterprise: 'Need Custom Solution?',
    enterpriseDesc: 'Get a tailored plan for your organization',
    talkToUs: 'Talk to Us',
    trustedBy: 'Smart logistics optimization for Indian businesses',
  },
  hi: {
    title: 'सरल, पारदर्शी मूल्य निर्धारण',
    subtitle: 'अपनी लॉजिस्टिक्स ज़रूरतों के लिए सही प्लान चुनें',
    monthly: 'मासिक',
    yearly: 'वार्षिक',
    savePercent: '17% बचाएं',
    perMonth: '/माह',
    perYear: '/वर्ष',
    startFreeTrial: '14-दिन का फ्री ट्रायल',
    getStarted: 'शुरू करें',
    contactSales: 'सेल्स से संपर्क करें',
    currentPlan: 'वर्तमान प्लान',
    mostPopular: 'सबसे लोकप्रिय',
    features: 'सुविधाएं',
    limits: 'उपयोग सीमाएं',
    users: 'यूज़र्स',
    trucks: 'ट्रक प्रबंधित',
    shipments: 'शिपमेंट/माह',
    packing: 'पैकिंग ऑप्टिमाइज़ेशन',
    routes: 'रूट ऑप्टिमाइज़ेशन',
    storage: 'स्टोरेज',
    apiCalls: 'API कॉल/माह',
    smsOtp: 'SMS OTP/माह',
    support: 'सपोर्ट',
    unlimited: 'अनलिमिटेड',
    addOns: 'ऐड-ऑन्स',
    freeForever: 'हमेशा मुफ्त प्लान',
    freeFeatures: 'TruckOpti आज़माने के लिए बिल्कुल सही',
    startFree: 'मुफ्त शुरू करें',
    enterprise: 'कस्टम समाधान चाहिए?',
    enterpriseDesc: 'अपने संगठन के लिए टेलर्ड प्लान पाएं',
    talkToUs: 'हमसे बात करें',
    trustedBy: 'भारतीय व्यवसायों के लिए स्मार्ट लॉजिस्टिक्स ऑप्टिमाइज़ेशन',
  }
}

const tierIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  starter: Rocket,
  growth: Zap,
  professional: Star,
  enterprise: Crown,
}

const tierColors: Record<string, string> = {
  starter: 'from-blue-500 to-blue-600',
  growth: 'from-green-500 to-green-600',
  professional: 'from-purple-500 to-purple-600',
  enterprise: 'from-orange-500 to-orange-600',
}

export default function PricingPage() {
  useEffect(() => {
    document.title = 'Pricing - TruckOpti'
  }, [])

  const [lang, setLang] = useState<Language>('en')
  const [isYearly, setIsYearly] = useState(false)
  const labels = t[lang]

  // Fetch pricing plans from database with fallback to static
  const { data: pricingTiers, isLoading } = useQuery<PricingTier[]>({
    queryKey: ['pricing-plans'],
    queryFn: fetchPricingPlans,
    staleTime: 1000 * 60 * 5, // 5 minutes
    initialData: PRICING_TIERS
  })

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const formatLimit = (value: number) => {
    if (value === -1) return labels.unlimited
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 py-12 px-4">
      {/* Language Toggle */}
      <div className="max-w-7xl mx-auto mb-8 flex justify-end">
        <button
          onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Globe className="w-4 h-4" />
          <span className="font-medium">{lang === 'en' ? 'हिन्दी' : 'English'}</span>
        </button>
      </div>

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
          {labels.title}
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
          {labels.subtitle}
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              !isYearly
                ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {labels.monthly}
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              isYearly
                ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {labels.yearly}
            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              {labels.savePercent}
            </span>
          </button>
        </div>
      </div>

      {/* Free Tier Banner */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {labels.freeForever}
              </h3>
              <p className="text-slate-600 dark:text-slate-400">{labels.freeFeatures}</p>
            </div>
            <button className="px-6 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              {labels.startFree}
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 animate-pulse">
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-6" />
              <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded mb-6" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          ))
        ) : (
          pricingTiers.map((tier: PricingTier) => {
          const Icon = tierIcons[tier.id] || Zap
          const colorClass = tierColors[tier.id] || 'from-blue-500 to-blue-600'
          const isPopular = tier.id === 'growth'
          const price = isYearly ? tier.yearlyPrice : tier.monthlyPrice
          const priceLabel = isYearly ? labels.perYear : labels.perMonth

          return (
            <div
              key={tier.id}
              className={`relative bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 transition-transform hover:scale-105 ${
                isPopular
                  ? 'border-green-500 dark:border-green-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-green-500 text-white text-sm font-medium px-4 py-1 rounded-full">
                    {labels.mostPopular}
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${colorClass} text-white`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                      {lang === 'en' ? tier.name : tier.nameHi}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tier.targetAudience}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900 dark:text-white">
                      {formatPrice(price)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{priceLabel}</span>
                  </div>
                  {isYearly && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      {formatPrice(tier.monthlyPrice * 12 - tier.yearlyPrice)} saved yearly
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    tier.id === 'enterprise'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
                      : `bg-gradient-to-r ${colorClass} text-white hover:opacity-90`
                  }`}
                >
                  {tier.id === 'enterprise' ? labels.contactSales : labels.getStarted}
                </button>

                {/* Features */}
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                    {labels.features}
                  </p>
                  <ul className="space-y-2">
                    {tier.features.slice(0, 6).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Limits */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                    {labels.limits}
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{labels.users}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatLimit(tier.limits.users)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{labels.trucks}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatLimit(tier.limits.trucksManaged)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{labels.shipments}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatLimit(tier.limits.shipmentsPerMonth)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{labels.packing}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatLimit(tier.limits.packingOptimizations)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })
        )}
      </div>

      {/* Enterprise CTA */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 rounded-2xl p-8 text-center">
          <Building2 className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">{labels.enterprise}</h3>
          <p className="text-slate-300 mb-6">{labels.enterpriseDesc}</p>
          <button className="px-8 py-3 bg-white text-slate-900 rounded-xl font-medium hover:bg-slate-100 transition-colors">
            {labels.talkToUs}
          </button>
        </div>
      </div>

      {/* Trust Badge */}
      <p className="text-center text-slate-500 dark:text-slate-400 mt-12">
        {labels.trustedBy}
      </p>
    </div>
  )
}
