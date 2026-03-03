import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Truck } from 'lucide-react'

export default function PrivacyPage() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Privacy Policy - TruckOpti'
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
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white ml-2">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 prose prose-slate dark:prose-invert max-w-none">
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
          Last updated: June 2025
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">1. Information We Collect</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-3">We collect the following types of information:</p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li><strong>Account Information:</strong> Name, email address, phone number, company name, and GSTIN.</li>
            <li><strong>Usage Data:</strong> Pages visited, features used, and actions taken within the app.</li>
            <li><strong>Business Data:</strong> Truck details, shipment records, customer information, and route data you enter.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li>To provide and improve the TruckOpti service.</li>
            <li>To process payments and manage subscriptions.</li>
            <li>To send service-related notifications and updates.</li>
            <li>To generate GST invoices and compliance documents.</li>
            <li>To analyze usage patterns and optimize the platform.</li>
            <li>To respond to support requests and inquiries.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">3. Data Storage and Security</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Your data is stored securely on Supabase infrastructure hosted in AWS data centers.
            We implement industry-standard encryption (TLS in transit, AES-256 at rest) and access
            controls to protect your information. We retain your data for the duration of your account
            and up to 3 years after account closure for legal and compliance purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">4. Sharing of Information</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-3">
            We do not sell your personal data. We may share data with:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li><strong>Service Providers:</strong> Payment processors (Razorpay, PhonePe), cloud services (Supabase, Vercel).</li>
            <li><strong>Legal Compliance:</strong> When required by law, court order, or regulatory authority.</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">5. Your Rights</h2>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-400 space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal data.</li>
            <li><strong>Correction:</strong> Update inaccurate or incomplete data.</li>
            <li><strong>Deletion:</strong> Request deletion of your account and data.</li>
            <li><strong>Portability:</strong> Export your business data in CSV format.</li>
            <li><strong>Objection:</strong> Opt out of non-essential communications.</li>
          </ul>
          <p className="text-slate-600 dark:text-slate-400 mt-3">
            To exercise these rights, contact us at{' '}
            <a href="mailto:privacy@truckopti.in" className="text-primary-600 hover:underline">
              privacy@truckopti.in
            </a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">6. Cookies</h2>
          <p className="text-slate-600 dark:text-slate-400">
            We use essential cookies for authentication and session management. We use analytics
            cookies to understand how users interact with the platform. You can disable non-essential
            cookies through your browser settings, though this may affect functionality.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">7. Children's Privacy</h2>
          <p className="text-slate-600 dark:text-slate-400">
            TruckOpti is not intended for use by anyone under the age of 18. We do not knowingly
            collect personal information from minors.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">8. Changes to This Policy</h2>
          <p className="text-slate-600 dark:text-slate-400">
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes via email or a prominent notice within the app at least 30 days before changes
            take effect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">9. Contact Us</h2>
          <p className="text-slate-600 dark:text-slate-400">
            For privacy concerns or to exercise your rights, contact our Data Protection Officer at{' '}
            <a href="mailto:privacy@truckopti.in" className="text-primary-600 hover:underline">
              privacy@truckopti.in
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
