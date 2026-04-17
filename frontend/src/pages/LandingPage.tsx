import { Link } from 'react-router-dom'
import { useLanguageStore } from '../stores/languageStore'
import {
  Package, Route, MapPin, Building2,
  ArrowRight, Truck, Shield, Clock, CheckCircle2
} from 'lucide-react'

const FEATURES = [
  {
    icon: Package,
    titleEn: '3D Bin Packing',
    titleHi: '3D बिन पैकिंग',
    descEn: 'AI-powered cargo optimization',
    descHi: 'AI-संचालित कार्गो ऑप्टिमाइज़ेशन'
  },
  {
    icon: Route,
    titleEn: 'Route Optimization',
    titleHi: 'रूट ऑप्टिमाइज़ेशन',
    descEn: 'Smart routing with toll costs',
    descHi: 'टोल लागत के साथ स्मार्ट रूटिंग'
  },
  {
    icon: MapPin,
    titleEn: 'Live GPS Tracking',
    titleHi: 'लाइव GPS ट्रैकिंग',
    descEn: 'Real-time shipment monitoring',
    descHi: 'रीयल-टाइम शिपमेंट मॉनिटरिंग'
  },
  {
    icon: Building2,
    titleEn: 'Agency Dispatch',
    titleHi: 'एजेंसी डिस्पैच',
    descEn: 'Connect with transport agencies',
    descHi: 'परिवहन एजेंसियों से जुड़ें'
  }
]

const TESTIMONIALS = [
  {
    name: 'Rajesh Kumar',
    role: 'Fleet Owner, Delhi',
    textEn: 'TruckOpti helped us optimize our routes and save 30% on fuel costs.',
    textHi: 'TruckOpti ने हमारे रूट को ऑप्टिमाइज़ करने और ईंधन लागत में 30% बचत करने में मदद की।'
  },
  {
    name: 'Priya Sharma',
    role: 'Logistics Manager, Mumbai',
    textEn: 'The 3D packing feature is a game-changer for our warehouse operations.',
    textHi: '3D पैकिंग फीचर हमारे गोदाम संचालन के लिए गेम-चेंजर है।'
  },
  {
    name: 'Amit Patel',
    role: 'Transport Agency Owner',
    textEn: 'Easy driver dispatch and live tracking give our customers peace of mind.',
    textHi: 'आसान ड्राइवर डिस्पैच और लाइव ट्रैकिंग हमारे ग्राहकों को मानसिक शांति देते हैं।'
  }
]

export default function LandingPage() {
  const { language, toggleLanguage } = useLanguageStore()
  const languageFont = language === 'hi' ? 'font-hindi' : ''

  const t = {
    heroBadge: language === 'en'
      ? 'Built for high-volume Indian logistics teams'
      : 'उच्च-वॉल्यूम भारतीय लॉजिस्टिक्स टीमों के लिए बनाया गया',
    heroTitle: language === 'en'
      ? "India's Smartest Truck Booking Platform"
      : 'भारत का स्मार्टेस्ट ट्रक बुकिंग प्लेटफॉर्म',
    heroSubtitle: language === 'en'
      ? 'AI-powered 3D packing, route optimization, live GPS tracking, and agency dispatch for India logistics.'
      : 'भारत लॉजिस्टिक्स के लिए AI-संचालित 3D पैकिंग, रूट ऑप्टिमाइज़ेशन, लाइव GPS ट्रैकिंग और एजेंसी डिस्पैच।',
    heroPanelEyebrow: language === 'en' ? 'Operator Snapshot' : 'ऑपरेटर स्नैपशॉट',
    heroPanelTitle: language === 'en'
      ? 'Plan loads, dispatch trucks, and track movement without hopping between tools.'
      : 'अलग-अलग टूल बदले बिना लोड प्लान करें, ट्रक डिस्पैच करें और मूवमेंट ट्रैक करें।',
    heroPanelSubtitle: language === 'en'
      ? 'TruckOpti keeps packing intelligence, route decisions, and live field visibility in one workflow.'
      : 'TruckOpti पैकिंग इंटेलिजेंस, रूट निर्णय और लाइव फील्ड विजिबिलिटी को एक ही वर्कफ़्लो में रखता है।',
    ctaStart: language === 'en' ? 'Start Free' : 'मुफ्त शुरू करें',
    ctaPricing: language === 'en' ? 'View Pricing' : 'मूल्य देखें',
    features: language === 'en' ? 'Features' : 'विशेषताएं',
    featuresEyebrow: language === 'en' ? 'Platform' : 'प्लेटफॉर्म',
    featuresIntro: language === 'en'
      ? 'From pre-dispatch planning to live execution, every step is designed to reduce dead space, idle time, and manual follow-up.'
      : 'प्री-डिस्पैच प्लानिंग से लेकर लाइव एग्जीक्यूशन तक, हर स्टेप को खाली जगह, निष्क्रिय समय और मैन्युअल फॉलो-अप कम करने के लिए डिज़ाइन किया गया है।',
    testimonials: language === 'en' ? 'What Our Users Say' : 'हमारे उपयोगकर्ता क्या कहते हैं',
    testimonialsIntro: language === 'en'
      ? 'Teams use TruckOpti to cut wasted kilometres, speed up loading, and give customers cleaner visibility.'
      : 'टीमें TruckOpti का उपयोग बेकार किलोमीटर घटाने, लोडिंग तेज़ करने और ग्राहकों को साफ़ विजिबिलिटी देने के लिए करती हैं।',
    ctaTitle: language === 'en'
      ? 'Ready to Transform Your Logistics?'
      : 'अपने लॉजिस्टिक्स को बदलने के लिए तैयार हैं?',
    ctaSubtitle: language === 'en'
      ? 'Join thousands of businesses already using TruckOpti.'
      : 'हजारों व्यवसायों से जुड़ें जो पहले से ही TruckOpti का उपयोग कर रहे हैं।',
    ctaEyebrow: language === 'en' ? 'Launch Faster' : 'तेज़ लॉन्च',
    contact: language === 'en' ? 'Contact Us' : 'संपर्क करें',
    whyChoose: language === 'en' ? 'Why Choose TruckOpti' : 'TruckOpti क्यों चुनें',
    whyChooseSubtitle: language === 'en'
      ? 'The platform is tuned for the daily realities of Indian fleet, dispatch, and warehouse operations.'
      : 'यह प्लेटफॉर्म भारतीय फ्लीट, डिस्पैच और वेयरहाउस ऑपरेशंस की रोज़मर्रा की वास्तविकताओं के लिए ट्यून किया गया है।',
    footerTagline: language === 'en'
      ? 'Planning, dispatch, and live shipment visibility for modern logistics operations.'
      : 'आधुनिक लॉजिस्टिक्स ऑपरेशंस के लिए प्लानिंग, डिस्पैच और लाइव शिपमेंट विजिबिलिटी।'
  }

  const heroStats = [
    {
      value: '30%',
      label: language === 'en' ? 'Fuel spend down' : 'ईंधन खर्च कम',
    },
    {
      value: '50%',
      label: language === 'en' ? 'Faster bay planning' : 'तेज़ बे प्लानिंग',
    },
    {
      value: '24/7',
      label: language === 'en' ? 'Ops visibility' : 'ऑप्स विजिबिलिटी',
    },
  ]

  const heroChecklist = [
    language === 'en' ? '3D load plans before dispatch' : 'डिस्पैच से पहले 3D लोड प्लान',
    language === 'en' ? 'Rate-aware routes with toll logic' : 'टोल लॉजिक के साथ रेट-अवेयर रूट्स',
    language === 'en' ? 'Live trip and driver visibility' : 'लाइव ट्रिप और ड्राइवर विजिबिलिटी',
  ]

  const trustCards = [
    {
      icon: Shield,
      title: language === 'en' ? 'Secure workflow' : 'सुरक्षित वर्कफ़्लो',
      description: language === 'en'
        ? 'Control shipments, plans, and customer updates from one surface.'
        : 'शिपमेंट, प्लान और ग्राहक अपडेट एक ही सतह से कंट्रोल करें।',
      accent: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      icon: Clock,
      title: language === 'en' ? 'Always-on operations' : 'हमेशा-ऑन ऑपरेशंस',
      description: language === 'en'
        ? 'Support loading, dispatch, and tracking throughout the working day.'
        : 'पूरे कार्यदिवस में लोडिंग, डिस्पैच और ट्रैकिंग को सपोर्ट करें।',
      accent: 'text-primary-600 dark:text-primary-300',
      bg: 'bg-primary-50 dark:bg-primary-950/30',
    },
    {
      icon: Truck,
      title: language === 'en' ? 'Built for scale' : 'स्केल के लिए तैयार',
      description: language === 'en'
        ? 'Move from a single team to multi-branch agency dispatch without rebuilding the flow.'
        : 'एक टीम से मल्टी-ब्रांच एजेंसी डिस्पैच तक बिना फ्लो दोबारा बनाए बढ़ें।',
      accent: 'text-saffron dark:text-orange-300',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
    },
  ]

  const outcomeStats = [
    {
      value: '30%',
      label: language === 'en' ? 'Fuel Cost Savings' : 'ईंधन लागत बचत',
    },
    {
      value: '50%',
      label: language === 'en' ? 'Faster Packing' : 'तेज़ पैकिंग',
    },
    {
      value: '100%',
      label: language === 'en' ? 'Real-time Tracking' : 'रीयल-टाइम ट्रैकिंग',
    },
  ]

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.14),_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#ffffff_46%,#eef4ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_48%,#111827_100%)] ${languageFont}`}>
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
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleLanguage}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-primary-300 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
            >
              {language === 'en' ? 'हिंदी' : 'English'}
            </button>
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-primary-600 dark:text-slate-300 dark:hover:text-primary-300"
            >
              {language === 'en' ? 'Login' : 'लॉगिन'}
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-600/20 transition-colors hover:bg-primary-700"
            >
              {language === 'en' ? 'Sign Up' : 'साइन अप'}
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
      <section className="px-4 py-16 lg:py-20">
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
                  {language === 'en' ? feature.titleEn : feature.titleHi}
                </h3>
                <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-300">
                  {language === 'en' ? feature.titleHi : feature.titleEn}
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {language === 'en' ? feature.descEn : feature.descHi}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {language === 'en' ? feature.descHi : feature.descEn}
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

      {/* Testimonials Section */}
      <section className="px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary-600 dark:text-primary-300">
              Customer Voice
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {t.testimonials}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400 sm:text-base">
              {t.testimonialsIntro}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial, idx) => (
              <div
                key={idx}
                className="rounded-[28px] border border-slate-200/70 bg-white/90 p-6 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <span className="text-4xl font-black leading-none text-primary-200 dark:text-primary-700">“</span>
                <p className="mt-4 text-base leading-7 text-slate-700 dark:text-slate-200">
                  {language === 'en' ? testimonial.textEn : testimonial.textHi}
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {language === 'en' ? testimonial.textHi : testimonial.textEn}
                </p>
                <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-700">
                  <p className="font-semibold text-slate-800 dark:text-white">{testimonial.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{testimonial.role}</p>
                </div>
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
              <Link to="/contact" className="transition-colors hover:text-white">{t.contact}</Link>
              <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
              <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-800 pt-6 text-sm text-slate-500">
            © 2026 TruckOpti. {t.footerTagline}
          </div>
        </div>
      </footer>
    </div>
  )
}
