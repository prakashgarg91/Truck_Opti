import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Smartphone, AlertCircle, FlaskConical, IndianRupee, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { initiatePhonePePayment, getPaymentConfig } from '../services/phonepePayment';
import { initiateRazorpayPayment, getRazorpayConfig } from '../services/razorpayPayment';
import toast from 'react-hot-toast';

type PaymentMethod = 'phonepe' | 'razorpay';

const TestPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState(1); // Default ₹1 for testing
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('razorpay');

  const phonePeConfig = getPaymentConfig();
  const razorpayConfig = getRazorpayConfig();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setLoading(false);
  };

  const handleTestPayment = async () => {
    if (!phone || phone.length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setProcessing(true);
    
    try {
      const amountInPaise = amount * 100; // Convert to paise
      const userId = user?.id || 'test-user-' + Date.now();

      if (paymentMethod === 'razorpay') {
        // Use Razorpay (works better for testing)
        const result = await initiateRazorpayPayment({
          amount: amountInPaise,
          description: `Test Payment - ₹${amount}`,
          customerPhone: phone,
          customerEmail: user?.email,
          userId: userId,
          planId: 'test-plan',
          billingCycle: 'monthly',
        });

        if (result.success) {
          toast.success(`Payment successful! ID: ${result.paymentId}`);
          navigate(`/payment/callback?status=success&txnId=${result.paymentId}`);
        } else {
          toast.error(result.error || 'Payment failed');
        }
      } else {
        // Use PhonePe
        const result = await initiatePhonePePayment({
          amount: amountInPaise,
          orderId: `TEST${Date.now()}`,
          userId: userId,
          planId: 'test-plan',
          billingCycle: 'monthly',
          customerPhone: phone,
          customerEmail: user?.email,
        });

        if (result.success && result.data?.instrumentResponse?.redirectInfo?.url) {
          toast.success('Redirecting to PhonePe...');
          window.location.href = result.data.instrumentResponse.redirectInfo.url;
        } else {
          toast.error(result.message || 'Payment initiation failed');
          console.error('Payment error:', result);
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to initiate payment');
    } finally {
      setProcessing(false);
    }
  };

  // Quick login for testing
  const handleQuickLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test123456',
    });
    
    if (error) {
      // Create test user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: `test${Date.now()}@example.com`,
        password: 'test123456',
      });
      if (!signUpError && signUpData.user) {
        setUser(signUpData.user);
        toast.success('Test user created!');
      }
    } else if (data.user) {
      setUser(data.user);
      toast.success('Logged in!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const isTestMode = paymentMethod === 'razorpay' ? razorpayConfig.isTestMode : phonePeConfig.isTestMode;
  const merchantId = paymentMethod === 'razorpay' ? razorpayConfig.keyId : phonePeConfig.merchantId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto mt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full mb-4">
            <FlaskConical className="w-8 h-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Test Payment
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Test payment integration with ₹{amount}
          </p>
        </div>

        {/* Payment Method Selector */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setPaymentMethod('razorpay')}
            className={`p-4 rounded-xl border-2 transition-all ${
              paymentMethod === 'razorpay'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
            }`}
          >
            <CreditCard className={`w-6 h-6 mx-auto mb-2 ${paymentMethod === 'razorpay' ? 'text-blue-600' : 'text-gray-400'}`} />
            <p className={`text-sm font-medium ${paymentMethod === 'razorpay' ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'}`}>
              Razorpay
            </p>
            <p className="text-xs text-green-600">✓ Test Mode Works</p>
          </button>
          <button
            onClick={() => setPaymentMethod('phonepe')}
            className={`p-4 rounded-xl border-2 transition-all ${
              paymentMethod === 'phonepe'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                : 'border-gray-200 dark:border-gray-600 hover:border-purple-300'
            }`}
          >
            <Smartphone className={`w-6 h-6 mx-auto mb-2 ${paymentMethod === 'phonepe' ? 'text-purple-600' : 'text-gray-400'}`} />
            <p className={`text-sm font-medium ${paymentMethod === 'phonepe' ? 'text-purple-600' : 'text-gray-600 dark:text-gray-400'}`}>
              PhonePe UPI
            </p>
            <p className="text-xs text-yellow-600">⚠ Sandbox Only</p>
          </button>
        </div>

        {/* Environment Badge */}
        <div className="mb-6 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {isTestMode ? '🧪 Test/Sandbox Mode' : '🚀 Production Mode'}
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {paymentMethod === 'razorpay' ? 'Key' : 'Merchant'}: {merchantId}
            </p>
          </div>
        </div>

        {/* Payment Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-6">
          {/* Amount Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Test Amount (₹)
            </label>
            <div className="flex gap-2 mb-3">
              {[1, 2, 5, 10].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all ${
                    amount === amt
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-600'
                      : 'border-gray-200 dark:border-gray-600 hover:border-orange-300'
                  }`}
                >
                  <IndianRupee className="w-4 h-4 inline" />
                  {amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="100"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Custom amount"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Phone Number (for UPI)
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter 10-digit mobile number"
                className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-r-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                maxLength={10}
              />
            </div>
            {phone.length > 0 && phone.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Enter complete 10-digit number</p>
            )}
          </div>

          {/* User Status */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">User Status:</span>
              {user ? (
                <span className="flex items-center text-sm text-green-600 dark:text-green-400">
                  <Check className="w-4 h-4 mr-1" />
                  {user.email || 'Logged In'}
                </span>
              ) : (
                <button
                  onClick={handleQuickLogin}
                  className="text-sm text-orange-600 hover:text-orange-700 underline"
                >
                  Quick Login
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between items-center text-lg font-bold">
              <span className="text-gray-900 dark:text-white">Total:</span>
              <span className="text-orange-600">
                <IndianRupee className="w-5 h-5 inline" />
                {amount.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Amount in paise: {amount * 100}
            </p>
          </div>

          {/* Pay Button */}
          <button
            onClick={handleTestPayment}
            disabled={processing || phone.length < 10}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
              processing || phone.length < 10
                ? 'bg-gray-400 cursor-not-allowed'
                : paymentMethod === 'razorpay'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg hover:shadow-xl'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl'
            }`}
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : paymentMethod === 'razorpay' ? (
              <>
                <CreditCard className="w-5 h-5" />
                Pay ₹{amount} with Razorpay
              </>
            ) : (
              <>
                <Smartphone className="w-5 h-5" />
                Pay ₹{amount} with PhonePe
              </>
            )}
          </button>

          {/* Payment Info */}
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            <p>Powered by {paymentMethod === 'razorpay' ? 'Razorpay' : 'PhonePe'} • Secure Payment</p>
            <p className="mt-1">
              {isTestMode 
                ? '⚠️ This is a TEST transaction - No real money will be charged'
                : '💰 Live transaction - Real money will be charged'}
            </p>
          </div>
        </div>

        {/* Test Instructions */}
        <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-xl">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            🧪 Test Instructions
          </h3>
          <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <li>1. Enter your phone number (must have UPI app)</li>
          {paymentMethod === 'razorpay' ? (
            <>
              <li>2. Select test amount (₹1 recommended)</li>
              <li>3. Click "Pay with Razorpay"</li>
              <li>4. Use test UPI ID: <code className="bg-gray-100 px-1 rounded">success@razorpay</code></li>
              <li>5. Or use test card: <code className="bg-gray-100 px-1 rounded">4111 1111 1111 1111</code></li>
              <li>6. Payment will complete in test mode</li>
            </>
          ) : (
            <>
              <li>2. Select test amount (₹1 recommended)</li>
              <li>3. Click "Pay with PhonePe"</li>
              <li>4. Complete payment in PhonePe app</li>
              <li>5. You'll be redirected back after payment</li>
            </>
          )}
          </ol>
          
          {paymentMethod === 'razorpay' && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <p className="text-xs text-green-600 dark:text-green-400">
                <strong>✓ Razorpay Test Mode:</strong> Use test credentials to simulate payment. 
                No real money will be charged.
              </p>
              <div className="mt-2 text-xs">
                <p><strong>Test UPI:</strong> success@razorpay</p>
                <p><strong>Test Card:</strong> 4111 1111 1111 1111, Exp: 12/25, CVV: 123</p>
              </div>
            </div>
          )}
          
          {paymentMethod === 'phonepe' && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                <strong>⚠ PhonePe Sandbox:</strong> In sandbox mode, the payment redirects 
                to a test page. For real ₹1 testing, we need production PhonePe credentials.
              </p>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/pricing')}
            className="text-gray-600 dark:text-gray-400 hover:text-orange-600 text-sm"
          >
            ← Back to Pricing
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestPaymentPage;
