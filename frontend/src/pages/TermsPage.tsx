import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Truck } from 'lucide-react'

export default function TermsPage() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Terms of Service - TruckOpti'
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary-600" />
            <span className="font-bold text-slate-900 dark:text-white">TruckOpti</span>
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white ml-2">Terms of Service</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 prose prose-slate dark:prose-invert max-w-none">
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
          Last updated: June 2025
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-600 dark:text-slate-400">
            By accessing or using TruckOpti ("the Service"), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">2. Description of Service</h2>
          <p className="text-slate-600 dark:text-slate-400">
            TruckOpti is a logistics optimization platform that provides truck packing optimization,
            route planning, fleet management, and GST invoicing for Indian businesses.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">3. User Accounts</h2>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li>You must provide accurate and complete information when creating an account.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You must notify us immediately of any unauthorized use of your account.</li>
            <li>One person or entity may not maintain more than one free account.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">4. Subscription and Payments</h2>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li>Subscription fees are billed in advance on a monthly or annual basis.</li>
            <li>All prices are in Indian Rupees (INR) and inclusive of applicable taxes.</li>
            <li>We reserve the right to change pricing with 30 days' notice.</li>
            <li>Refunds are issued at our discretion within 7 days of payment.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">5. Data and Privacy</h2>
          <p className="text-slate-600 dark:text-slate-400">
            We collect and process your data in accordance with our{' '}
            <Link to="/privacy" className="text-primary-600 hover:underline">
              Privacy Policy
            </Link>
            . By using the Service, you consent to such processing.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">6. Intellectual Property</h2>
          <p className="text-slate-600 dark:text-slate-400">
            The Service and its original content, features, and functionality are owned by TruckOpti
            and are protected by Indian and international copyright, trademark, and other intellectual
            property laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">7. Limitation of Liability</h2>
          <p className="text-slate-600 dark:text-slate-400">
            TruckOpti shall not be liable for any indirect, incidental, special, or consequential damages
            arising from the use of the Service. Our total liability shall not exceed the amount paid by
            you in the three months preceding the claim.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">8. Governing Law</h2>
          <p className="text-slate-600 dark:text-slate-400">
            These Terms shall be governed by the laws of India. Any disputes shall be subject to the
            exclusive jurisdiction of courts in Mumbai, Maharashtra.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">9. Contact Us</h2>
          <p className="text-slate-600 dark:text-slate-400">
            For questions about these Terms, please contact us at{' '}
            <button type="button" onClick={() => navigate('/contact')} className="text-primary-600 hover:underline">
              legal@truckopti.in
            </button>
          </p>
        </section>
      </div>
    </div>
  )
}
