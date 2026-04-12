import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Home, RefreshCw } from 'lucide-react';
import { checkPaymentStatus, verifyAndActivateSubscription } from '../services/phonepePayment';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { useAuthStore } from '../stores/authStore';

const PaymentCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const txnId = searchParams.get('txnId');
  const paymentId = searchParams.get('payment_id');
  const callbackStatus = searchParams.get('status');

  const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'pending'>('checking');
  const [message, setMessage] = useState('Verifying payment...');

  const verifyPayment = useCallback(async () => {
    try {
      // Check payment status
      const result = await checkPaymentStatus(txnId!);

      if (result.status === 'SUCCESS') {
        // Get payment details from our database
        const { data: paymentData } = await supabase
          .from('payment_history')
          .select('*')
          .eq('razorpay_order_id', txnId)
          .single();

        if (paymentData?.metadata) {
          if (user) {
            // Activate subscription
            const activationResult = await verifyAndActivateSubscription(
              txnId!,
              user.id,
              paymentData.metadata.plan_id,
              paymentData.metadata.billing_cycle
            );

            if (activationResult.success) {
              setStatus('success');
              setMessage('Payment successful! Your subscription is now active.');
            } else {
              setStatus('success');
              setMessage('Payment successful! Subscription will be activated shortly.');
            }
          }
        } else {
          setStatus('success');
          setMessage('Payment successful!');
        }
      } else if (result.status === 'FAILED') {
        setStatus('failed');
        setMessage(result.message || 'Payment failed. Please try again.');
      } else {
        setStatus('pending');
        setMessage('Payment is being processed. Please wait...');
      }
    } catch (error) {
      logger.error('Payment verification error:', error);
      setStatus('failed');
      setMessage('Unable to verify payment. Please contact support.');
    }
  }, [txnId, user]);

  useEffect(() => {
    document.title = 'Payment Status - TruckOpti'
  }, [])

  useEffect(() => {
    if (paymentId) {
      // Razorpay flow — payment already verified in razorpayPayment.ts
      if (callbackStatus === 'success' || !callbackStatus) {
        setStatus('success');
        setMessage('Payment successful! Your subscription is now active.');
      } else {
        setStatus('failed');
        setMessage('Payment failed. Please try again.');
      }
    } else if (txnId) {
      // PhonePe flow — verify via Edge Function
      verifyPayment();
    } else {
      setStatus('failed');
      setMessage('Invalid payment callback');
    }
  }, [txnId, paymentId, callbackStatus, verifyPayment]);

  const handleRetry = () => {
    setStatus('checking');
    setMessage('Verifying payment...');
    verifyPayment();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        {/* Status Icon */}
        <div className="mb-6">
          {status === 'checking' && (
            <div className="w-20 h-20 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          )}
          {status === 'failed' && (
            <div className="w-20 h-20 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
          )}
          {status === 'pending' && (
            <div className="w-20 h-20 mx-auto bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
            </div>
          )}
        </div>

        {/* Status Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {status === 'checking' && 'Verifying Payment'}
          {status === 'success' && 'Payment Successful! 🎉'}
          {status === 'failed' && 'Payment Failed'}
          {status === 'pending' && 'Payment Pending'}
        </h1>

        {/* Message */}
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          {message}
        </p>

        {/* Transaction ID */}
        {(txnId || paymentId) && (
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-6">
            <p className="text-xs text-gray-500 dark:text-gray-400">Transaction ID</p>
            <p className="text-sm font-mono text-gray-900 dark:text-white">{txnId || paymentId}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {status === 'success' && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Go to Dashboard
            </button>
          )}

          {status === 'failed' && (
            <>
              <button
                onClick={() => navigate('/pricing')}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700"
              >
                Try Again
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Go Home
              </button>
            </>
          )}

          {status === 'pending' && (
            <button
              onClick={handleRetry}
              className="w-full py-3 bg-yellow-600 text-white font-semibold rounded-xl hover:bg-yellow-700 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Check Again
            </button>
          )}
        </div>

        {/* Support */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
          Need help? Contact support at{' '}
          <a href="mailto:support@truckopti.in" className="text-blue-600 hover:underline">
            support@truckopti.in
          </a>
        </p>
      </div>
    </div>
  );
};

export default PaymentCallbackPage;
