import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, CreditCard, Smartphone, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { initiateRazorpayPayment, getRazorpayConfig, RazorpayPaymentResult } from '../services/razorpayPayment';
import { initiatePhonePePayment, getPaymentConfig } from '../services/phonepePayment';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import { useSubscription } from '../hooks/useSubscription';
import { useAuthStore } from '../stores/authStore';

interface Plan {
  id: string;
  name: string;
  name_hi: string;
  tier: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
}

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { subscription: currentSubscription, plan: currentPlan } = useSubscription();

  const planId = searchParams.get('plan');
  const billingCycle: 'monthly' | 'yearly' = searchParams.get('billing') === 'yearly' ? 'yearly' : 'monthly';

  const { user } = useAuthStore();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [subscriptionChange, setSubscriptionChange] = useState<'upgrade' | 'downgrade' | null>(null);

  const razorpayConfig = getRazorpayConfig();
  const phonePeConfig = getPaymentConfig();
  const hasLivePhonePe = phonePeConfig.isLaunchReady;
  const hasLiveRazorpay = razorpayConfig.isLaunchReady;
  const paymentTemporarilyUnavailable = !hasLivePhonePe && !hasLiveRazorpay;

  useEffect(() => {
    document.title = 'Checkout - TruckOpti'
  }, [])

  const loadData = useCallback(async () => {
    try {
      // Get user
      if (!user) {
        toast.error(language === 'en' ? 'Please login to continue' : 'कृपया जारी रखने के लिए लॉगिन करें');
        navigate('/login');
        return;
      }
      setEmail(user.email || '');

      // Get plan details
      if (!planId) {
        navigate('/pricing');
        return;
      }
      if (planId) {
        const { data: planData, error } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .single();

        if (error || !planData) {
          toast.error(language === 'en' ? 'Plan not found' : 'प्लान नहीं मिला');
          navigate('/pricing');
          return;
        }
        setPlan({
          ...planData,
          features: typeof planData.features === 'string'
            ? JSON.parse(planData.features)
            : planData.features,
        });

        // Check for existing subscription and determine upgrade/downgrade
        if (currentSubscription && currentPlan) {
          const tierOrder = { starter: 1, growth: 2, professional: 3, enterprise: 4 };
          const currentTier = currentPlan.tier || 'starter';
          const newTier = planData.tier || 'starter';
          const currentTierNum = tierOrder[currentTier as keyof typeof tierOrder] || 1;
          const newTierNum = tierOrder[newTier as keyof typeof tierOrder] || 1;

          if (newTierNum > currentTierNum) {
            setSubscriptionChange('upgrade');
          } else if (newTierNum < currentTierNum) {
            setSubscriptionChange('downgrade');
          }
        }
      }
    } catch (error) {
      logger.error('Error loading checkout data:', error);
      toast.error(language === 'en' ? 'Failed to load checkout' : 'चेकआउट लोड करने में विफल');
    } finally {
      setLoading(false);
    }
  }, [user, navigate, planId, currentSubscription, currentPlan]); // language removed: only used in toast text, not query logic

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePayment = async () => {
    if (!plan || !user) return;

    if (!phone || phone.length < 10) {
      toast.error(language === 'en' ? 'Please enter a valid phone number' : 'कृपया सही फ़ोन नंबर दर्ज करें');
      return;
    }

    if (paymentTemporarilyUnavailable) {
      toast.error('Live payments are temporarily unavailable. Please contact support.');
      return;
    }

    setProcessing(true);

    try {
      const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
      const taxAmount = Math.round(amount * 0.18); // 18% GST
      const totalAmount = amount + taxAmount;

      const phonePeResult = await initiatePhonePePayment({
        amount: totalAmount,
        orderId: `ORD${Date.now()}`,
        userId: user.id,
        planId: plan.id,
        billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly',
        customerPhone: phone,
        customerEmail: email,
      });

      if (phonePeResult.success && phonePeResult.data?.instrumentResponse?.redirectInfo?.url) {
        const redirectUrl = phonePeResult.data.instrumentResponse.redirectInfo.url;
        // Security: validate redirect URL is on an allowed PhonePe domain (BUG-REDIRECT-001 fix)
        const ALLOWED_PHONEPE_DOMAINS = ['api.phonepe.com', 'mercury.phonepe.com', 'api-preprod.phonepe.com'];
        let isSafeUrl = false;
        try {
          const parsed = new URL(redirectUrl);
          isSafeUrl = parsed.protocol === 'https:' &&
            ALLOWED_PHONEPE_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
        } catch {
          isSafeUrl = false;
        }
        if (!isSafeUrl) {
          logger.error('PhonePe redirect URL failed domain validation:', redirectUrl);
          toast.error(language === 'en' ? 'Payment redirect validation failed. Please try again.' : 'भुगतान पुनर्निर्देशन मान्यता विफल हुई। कृपया पुनः प्रयास करें।');
          setProcessing(false);
          return;
        }
        toast.success(language === 'en' ? 'Redirecting to PhonePe...' : 'PhonePe पर रीडायरेक्ट किया जा रहा है...');
        window.location.href = redirectUrl;
        return;
      }

      toast.error(language === 'en' ? 'PhonePe unavailable. Switching to Razorpay...' : 'PhonePe उपलब्ध नहीं है। Razorpay पर स्विच हो रहा है...');

      const result: RazorpayPaymentResult = await initiateRazorpayPayment({
        amount: totalAmount, // Already in paise from database
        description: `TruckOpti ${plan.name} - ${billingCycle === 'yearly' ? 'Annual' : 'Monthly'}`,
        userId: user.id,
        planId: plan.id,
        billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly',
        customerPhone: phone,
        customerEmail: email,
        customerName: user.name || 'Customer',
      });

      if (result.success) {
        toast.success(language === 'en' ? 'Payment successful!' : 'भुगतान सफल!');
        navigate('/payment/success?payment_id=' + result.paymentId);
      } else {
        toast.error(result.error || (language === 'en' ? 'Payment failed on both gateways' : 'दोनों पेमेंट गेटवे पर भुगतान विफल हुआ'));
      }
    } catch (error) {
      logger.error('Payment error:', error);
      toast.error('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const formatPrice = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Plan not found</p>
          <button
            onClick={() => navigate('/pricing')}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Plans
          </button>
        </div>
      </div>
    );
  }

  const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const taxAmount = Math.round(amount * 0.18);
  const totalAmount = amount + taxAmount;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Language Toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {language === 'en' ? 'हिंदी' : 'English'}
          </button>
        </div>

        {/* Test Mode Banner */}
        {(phonePeConfig.isTestMode || razorpayConfig.isTestMode) && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>
              {language === 'en'
                ? 'Test Mode: PhonePe primary, Razorpay fallback. No real payment will be processed in sandbox.'
                : 'टेस्ट मोड: कोई वास्तविक भुगतान नहीं होगा'}
            </span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              {language === 'en' ? 'Order Summary' : 'ऑर्डर सारांश'}
            </h2>

            {/* Upgrade/Downgrade Notice */}
            {subscriptionChange && (
              <div className={`mb-4 p-3 rounded-lg ${subscriptionChange === 'upgrade' ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
                {subscriptionChange === 'upgrade' ? (
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {language === 'en'
                      ? 'You are upgrading your plan. The new features will be available immediately after payment.'
                      : 'आप अपना प्लान अपग्रेड कर रहे हैं। नई सुविधाएं भुगतान के तुरंत बाद उपलब्ध होंगी।'}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {language === 'en'
                      ? 'You are downgrading your plan. The change will take effect at the end of your current billing period.'
                      : 'आप अपना प्लान डाउनग्रेड कर रहे हैं। यह परिवर्तन आपकी वर्तमान बिलिंग अवधि के अंत में प्रभावी होगा।'}
                  </p>
                )}
              </div>
            )}

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {language === 'en' ? plan.name : plan.name_hi} Plan
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {billingCycle === 'yearly'
                      ? (language === 'en' ? 'Annual subscription' : 'वार्षिक सदस्यता')
                      : (language === 'en' ? 'Monthly subscription' : 'मासिक सदस्यता')}
                  </p>
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatPrice(amount)}
                </span>
              </div>
            </div>

            {/* Features */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {language === 'en' ? 'Included Features' : 'शामिल सुविधाएं'}
              </h4>
              <ul className="space-y-2">
                {plan.features.slice(0, 5).map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Check className="w-4 h-4 text-green-500" />
                    {feature.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>

            {/* Price Breakdown */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  {language === 'en' ? 'Subtotal' : 'उप-योग'}
                </span>
                <span className="text-gray-900 dark:text-white">{formatPrice(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  {language === 'en' ? 'GST (18%)' : 'जीएसटी (18%)'}
                </span>
                <span className="text-gray-900 dark:text-white">{formatPrice(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">
                  {language === 'en' ? 'Total' : 'कुल'}
                </span>
                <span className="text-blue-600">{formatPrice(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              {language === 'en' ? 'Payment Details' : 'भुगतान विवरण'}
            </h2>

            <div className="space-y-4">
              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'en' ? 'Mobile Number' : 'मोबाइल नंबर'} *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {language === 'en' ? 'UPI payment link will be sent to this number' : 'यूपीआई पेमेंट लिंक इस नंबर पर भेजा जाएगा'}
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'en' ? 'Email Address' : 'ईमेल पता'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Payment Methods */}
              <div className="pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {language === 'en' ? 'Pay with' : 'भुगतान करें'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <Smartphone className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-600">UPI</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg opacity-50 cursor-not-allowed">
                    <CreditCard className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-400">Card</span>
                  </div>
                </div>
              </div>

              {/* UPI Apps */}
              <div className="flex justify-center gap-4 py-4">
                <img loading="lazy" src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/PhonePe_Logo.svg/1200px-PhonePe_Logo.svg.png" alt="PhonePe" className="h-8 object-contain" />
                <img loading="lazy" src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Google_Pay_Logo.svg/1200px-Google_Pay_Logo.svg.png" alt="GPay" className="h-8 object-contain" />
                <img loading="lazy" src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/1200px-UPI-Logo-vector.svg.png" alt="UPI" className="h-8 object-contain" />
              </div>

              {paymentTemporarilyUnavailable && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Live payments are temporarily unavailable on this deployment. Please contact support before attempting a subscription checkout.
                </div>
              )}

              {/* Pay Button */}
              <button
                onClick={handlePayment}
                disabled={processing || !phone || paymentTemporarilyUnavailable}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {language === 'en' ? 'Processing...' : 'प्रोसेसिंग...'}
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5" />
                    {language === 'en' ? `Pay ${formatPrice(totalAmount)}` : `${formatPrice(totalAmount)} भुगतान करें`}
                  </>
                )}
              </button>

              {/* Security Note */}
              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
                🔒 {language === 'en'
                  ? 'Secured by PhonePe (fallback Razorpay). Your payment information is encrypted.'
                  : 'फोनपे द्वारा सुरक्षित। आपकी भुगतान जानकारी एन्क्रिप्टेड है।'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
