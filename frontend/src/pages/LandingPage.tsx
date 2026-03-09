import { Link } from 'react-router-dom'
import { useLanguageStore } from '../stores/languageStore'
import {
  Package, Route, MapPin, Building2,
  ArrowRight, Truck, Shield, Clock
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

  const t = {
    heroTitle: language === 'en'
      ? "India's Smartest Truck Booking Platform"
      : 'भारत का स्मार्टेस्ट ट्रक बुकिंग प्लेटफॉर्म',
    heroSubtitle: language === 'en'
      ? 'AI-powered 3D packing, route optimization, live GPS tracking, and agency dispatch for India logistics.'
      : 'भारत लॉजिस्टिक्स के लिए AI-संचालित 3D पैकिंग, रूट ऑप्टिमाइज़ेशन, लाइव GPS ट्रैकिंग और एजेंसी डिस्पैच।',
    ctaStart: language === 'en' ? 'Start Free' : 'मुफ्त शुरू करें',
    ctaPricing: language === 'en' ? 'View Pricing' : 'मूल्य देखें',
    features: language === 'en' ? 'Features' : 'विशेषताएं',
    testimonials: language === 'en' ? 'What Our Users Say' : 'हमारे उपयोगकर्ता क्या कहते हैं',
    ctaTitle: language === 'en'
      ? 'Ready to Transform Your Logistics?'
      : 'अपने लॉजिस्टिक्स को बदलने के लिए तैयार हैं?',
    ctaSubtitle: language === 'en'
      ? 'Join thousands of businesses already using TruckOpti.'
      : 'हजारों व्यवसायों से जुड़ें जो पहले से ही TruckOpti का उपयोग कर रहे हैं।',
    contact: language === 'en' ? 'Contact Us' : 'संपर्क करें',
    trusted: language === 'en' ? 'Trusted by' : 'इनके द्वारा विश्वसनीय',
    whyChoose: language === 'en' ? 'Why Choose TruckOpti' : 'TruckOpti क्यों चुनें'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800 dark:text-white">TruckOpti</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              {language === 'en' ? 'हिंदी' : 'English'}
            </button>
            <Link
              to="/login"
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              {language === 'en' ? 'Login' : 'लॉगिन'}
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {language === 'en' ? 'Sign Up' : 'साइन अप'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-800 dark:text-white mb-6 leading-tight">
            {t.heroTitle}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            {t.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {t.ctaStart}
              <ArrowRight size={20} />
            </Link>
            <Link
              to="/pricing"
              className="w-full sm:w-auto px-8 py-4 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-lg font-semibold rounded-xl hover:border-indigo-600 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-colors"
            >
              {t.ctaPricing}
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Badge */}
      <section className="py-8 px-4 border-y border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.trusted}</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Shield size={20} className="text-green-500" />
              <span className="font-medium">Secure</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Clock size={20} className="text-blue-500" />
              <span className="font-medium">24/7 Support</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Truck size={20} className="text-indigo-500" />
              <span className="font-medium">500+ Trucks</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-white mb-12">
            {t.features}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon size={24} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
                  {feature.titleEn}
                </h3>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-3">
                  {feature.titleHi}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {feature.descEn}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {feature.descHi}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="py-16 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-white mb-12">
            {t.whyChoose}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">30%</div>
              <p className="text-slate-600 dark:text-slate-300">
                {language === 'en' ? 'Fuel Cost Savings' : 'ईंधन लागत बचत'}
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">50%</div>
              <p className="text-slate-600 dark:text-slate-300">
                {language === 'en' ? 'Faster Packing' : 'तेज़ पैकिंग'}
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">100%</div>
              <p className="text-slate-600 dark:text-slate-300">
                {language === 'en' ? 'Real-time Tracking' : 'रीयल-टाइम ट्रैकिंग'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-white mb-12">
            {t.testimonials}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testimonial, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <p className="text-slate-600 dark:text-slate-300 mb-4 italic">
                  "{testimonial.textEn}"
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  "{testimonial.textHi}"
                </p>
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                  <p className="font-semibold text-slate-800 dark:text-white">{testimonial.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {t.ctaTitle}
          </h2>
          <p className="text-indigo-100 mb-8">
            {t.ctaSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 bg-white text-indigo-600 text-lg font-bold rounded-xl hover:bg-indigo-50 transition-colors"
            >
              {t.ctaStart}
            </Link>
            <Link
              to="/contact"
              className="w-full sm:w-auto px-8 py-4 border-2 border-white/30 text-white text-lg font-semibold rounded-xl hover:bg-white/10 transition-colors"
            >
              {t.contact}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">TruckOpti</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link to="/pricing" className="hover:text-white transition-colors">
                {language === 'en' ? 'Pricing' : 'मूल्य'}
              </Link>
              <Link to="/contact" className="hover:text-white transition-colors">
                {language === 'en' ? 'Contact' : 'संपर्क'}
              </Link>
              <Link to="/terms" className="hover:text-white transition-colors">
                {language === 'en' ? 'Terms' : 'नियम'}
              </Link>
              <Link to="/privacy" className="hover:text-white transition-colors">
                {language === 'en' ? 'Privacy' : 'गोपनीयता'}
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-slate-800 text-center text-sm">
            <p>&copy; 2026 TruckOpti. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
