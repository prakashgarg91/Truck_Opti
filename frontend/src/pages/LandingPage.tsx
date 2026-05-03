import { Link } from 'react-router-dom'
import {
  Package, Route, MapPin, Building2,
  ArrowRight, Truck, Shield, Clock, CheckCircle2
} from 'lucide-react'

const FEATURES = [
  {
    icon: Package,
    title: '3D Bin Packing',
    desc: 'AI-powered cargo optimization'
  },
  {
    icon: Route,
    title: 'Route Optimization',
    desc: 'Smart routing with toll costs'
  },
  {
    icon: MapPin,
    title: 'Live GPS Tracking',
    desc: 'Real-time shipment monitoring'
  },
  {
    icon: Building2,
    title: 'Agency Dispatch',
    desc: 'Connect with transport agencies'
  }
]


export default function LandingPage() {

  const t = {
    heroBadge: 'Built for high-volume Indian logistics teams',
    heroTitle: "India's Smartest Truck Booking Platform",
    heroSubtitle: 'AI-powered 3D packing, route optimization, live GPS tracking, and agency dispatch for India logistics.',
    heroPanelEyebrow: 'Operator Snapshot',
    heroPanelTitle: 'Plan loads, dispatch trucks, and track movement without hopping between tools.',
    heroPanelSubtitle: 'TruckOpti keeps packing intelligence, route decisions, and live field visibility in one workflow.',
    ctaStart: 'Start Free',
    ctaPricing: 'View Pricing',
    features: 'Features',
    featuresEyebrow: 'Platform',
    featuresIntro: 'From pre-dispatch planning to live execution, every step is designed to reduce dead space, idle time, and manual follow-up.',
    ctaTitle: 'Ready to Transform Your Logistics?',
    ctaSubtitle: 'Join thousands of businesses already using TruckOpti.',
    ctaEyebrow: 'Launch Faster',
    contact: 'Contact Us',
    whyChoose: 'Why Choose TruckOpti',
    whyChooseSubtitle: 'The platform is tuned for the daily realities of Indian fleet, dispatch, and warehouse operations.',
    footerTagline: 'Planning, dispatch, and live shipment visibility for modern logistics operations.'
  }

  const heroStats = [
    {
      value: '30%',
      label: 'Fuel spend down',
    },
    {
      value: '50%',
      label: 'Faster bay planning',
    },
    {
      value: '24/7',
      label: 'Ops visibility',
    },
  ]

  const heroChecklist = [
    '3D load plans before dispatch',
    'Rate-aware routes with toll logic',
    'Live trip and driver visibility',
  ]

  const trustCards = [
    {
      icon: Shield,
      title: 'Secure workflow',
      description: 'Control shipments, plans, and customer updates from one surface.',
      accent: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      icon: Clock,
      title: 'Always-on operations',
      description: 'Support loading, dispatch, and tracking throughout the working day.',
      accent: 'text-primary-600 dark:text-primary-300',
      bg: 'bg-primary-50 dark:bg-primary-950/30',
    },
    {
      icon: Truck,
      title: 'Built for scale',
      description: 'Move from a single team to multi-branch agency dispatch without rebuilding the flow.',
      accent: 'text-saffron dark:text-orange-300',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
    },
  ]

  const outcomeStats = [
    {
      value: '30%',
      label: 'Fuel Cost Savings',
    },
    {
      value: '50%',
      label: 'Faster Packing',
    },
    {
      value: '100%',
      label: 'Real-time Tracking',
    },
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.14),_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#ffffff_46%,#eef4ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_48%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary-100/70 via-primary-50/30 to-transparent dark:from-primary-950/60 dark:via-primary-950/10 dark:to-transparent" />
      <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-orange-300/20 blur-3xl dark:bg-orange-500/15" />
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-primary-400/15 blur-3xl dark:bg-primary-500/20" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-600 shadow-lg shadow-primary-600/20">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">TruckOpti</span>
              <p className="hidden text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 sm:block">
                Logistics OS
              </p>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <a
              href="#features"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-primary-400 dark:hover:bg-slate-800 transition-colors"
            >
              {'Features'}
            </a>
            <a
              href="#how-it-works"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-primary-400 dark:hover:bg-slate-800 transition-colors"
            >
              {'How It Works'}
            </a>
            <Link
              to="/driver/register"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-primary-400 dark:hover:bg-slate-800 transition-colors"
            >
              {'Drivers'}
            </Link>
            <Link
              to="/agency/register"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-primary-400 dark:hover:bg-slate-800 transition-colors"
            >
              {'Agencies'}
            </Link>
            <Link
              to="/pricing"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-primary-400 dark:hover:bg-slate-800 transition-colors"
            >
              {'Pricing'}
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-primary-600 dark:text-slate-300 dark:hover:text-primary-300"
            >
              {'Login'}
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-600/20 transition-colors hover:bg-primary-700"
            >
              {'Sign Up'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-4 pb-14 pt-14 sm:pt-20 lg:pb-20 lg:pt-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.1fr)_380px] lg:items-center">
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200/80 bg-white/85 px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm backdrop-blur dark:border-primary-800/80 dark:bg-slate-900/80 dark:text-primary-300">
              <Shield className="h-4 w-4" />
              <span>{t.heroBadge}</span>
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl lg:leading-[1.05]">
              {t.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg sm:leading-8">
              {t.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                to="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-8 py-4 text-lg font-black text-white shadow-xl shadow-primary-600/20 transition-colors hover:bg-primary-700 sm:w-auto"
              >
                {t.ctaStart}
                <ArrowRight size={20} />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex w-full items-center justify-center rounded-2xl border-2 border-slate-300 bg-white/80 px-8 py-4 text-lg font-semibold text-slate-700 transition-colors hover:border-primary-300 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-primary-500 dark:hover:text-primary-300 sm:w-auto"
              >
                {t.ctaPricing}
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {heroChecklist.map((item) => (
                <div
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100/90 px-4 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-[32px] bg-gradient-to-br from-primary-500/20 via-orange-300/15 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85">
              <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[32px] bg-gradient-to-br from-primary-500 to-primary-700 opacity-95" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                  {t.heroPanelEyebrow}
                </p>
                <h2 className="mt-3 max-w-xs text-2xl font-bold text-slate-900 dark:text-white">
                  {t.heroPanelTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {t.heroPanelSubtitle}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-slate-200/70 bg-slate-50/85 p-4 dark:border-slate-700 dark:bg-slate-800/80"
                  >
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</div>
                    <div className="mt-1 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {heroChecklist.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-3 dark:bg-slate-800/70">
                    <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-sm font-medium leading-6 text-slate-700 dark:text-slate-200">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {trustCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border border-slate-200/70 bg-white/85 p-6 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.bg}`}>
                <card.icon className={`h-6 w-6 ${card.accent}`} />
              </div>
              <h3 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary-600 dark:text-primary-300">
              {t.featuresEyebrow}
            </p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                {t.features}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400 sm:text-base">
                {t.featuresIntro}
              </p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-primary-500 via-orange-400 to-emerald-500 opacity-70" />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-950/30">
                    <feature.icon size={24} className="text-primary-600 dark:text-primary-300" />
                  </div>
                  <span className="text-sm font-black tracking-[0.2em] text-slate-300 transition-colors group-hover:text-primary-300 dark:text-slate-600 dark:group-hover:text-primary-500">
                    0{idx + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-slate-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="px-4 py-6 lg:py-10">
        <div className="mx-auto overflow-hidden rounded-[32px] bg-slate-900 px-6 py-10 shadow-2xl dark:bg-slate-950 lg:max-w-7xl lg:px-12 lg:py-12">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary-300">Operational Gains</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t.whyChoose}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              {t.whyChooseSubtitle}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {outcomeStats.map((stat) => (
              <div key={stat.label} className="rounded-[24px] bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="text-4xl font-black tracking-tight text-white">{stat.value}</div>
                <p className="mt-3 text-sm font-medium text-slate-300">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-slate-50 dark:bg-slate-900/60 px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary-600 dark:text-primary-300">
              {'How It Works'}
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {'Get started in 3 simple steps'}
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400">
              No complex setup. Book your first truck in minutes.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                icon: CheckCircle2,
                color: 'text-primary-600 dark:text-primary-400',
                bg: 'bg-primary-50 dark:bg-primary-950/40',
                title: 'Create your account',
                desc: 'Sign up as a business, agency, or driver. Takes under 2 minutes.'
              },
              {
                step: '02',
                icon: Package,
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/40',
                title: 'Plan your shipment',
                desc: 'Add cargo details and get AI-optimized 3D packing and route in seconds.'
              },
              {
                step: '03',
                icon: Truck,
                color: 'text-orange-600 dark:text-orange-400',
                bg: 'bg-orange-50 dark:bg-orange-950/40',
                title: 'Dispatch & track live',
                desc: 'Assign a driver and follow the shipment in real time from pickup to delivery.'
              }
            ].map(({ step, icon: Icon, color, bg, title, desc }, i) => (
              <div
                key={i}
                className="relative flex flex-col gap-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-7 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center`}>
                    <Icon size={24} className={color} />
                  </div>
                  <span className="text-4xl font-black text-slate-100 dark:text-slate-700 select-none">{step}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{desc}</p>
                {i < 2 && (
                  <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight size={24} className="text-slate-300 dark:text-slate-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="px-4 pb-20 pt-6">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-gradient-to-r from-primary-700 via-primary-600 to-orange-500 px-6 py-10 shadow-2xl shadow-primary-900/20 lg:px-10 lg:py-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/70">{t.ctaEyebrow}</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {t.ctaTitle}
              </h2>
              <p className="mt-4 text-base leading-7 text-white/85">
                {t.ctaSubtitle}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-base font-bold text-slate-900 transition-colors hover:bg-slate-100"
              >
                {t.ctaStart}
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-2xl border border-white/40 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/10"
              >
                {t.contact}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-slate-950 px-4 py-10 text-slate-400 dark:border-slate-800">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-600">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-black tracking-tight text-white">TruckOpti</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                {t.footerTagline}
              </p>
            </div>

            <div className="flex flex-wrap gap-6 text-sm font-medium">
              <Link to="/pricing" className="transition-colors hover:text-white">{t.ctaPricing}</Link>
              <Link to="/driver/register" className="transition-colors hover:text-white">Drivers</Link>
              <Link to="/agency/register" className="transition-colors hover:text-white">Agencies</Link>
              <Link to="/contact" className="transition-colors hover:text-white">{t.contact}</Link>
              <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
              <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-800 pt-6 text-sm text-slate-500">
            © 2026 TruckOpti. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
