import { supabase } from '../lib/supabase';

function isUnset(value?: string): boolean {
  if (!value) return true;
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    normalized.toUpperCase().includes('REPLACE_ME') ||
    normalized.toUpperCase().includes('YOUR_')
  );
}

// PhonePe Configuration
// Payment checksum generation must happen server-side via Supabase Edge Function
const PHONEPE_CONFIG = {
  merchantId: import.meta.env.VITE_PHONEPE_MERCHANT_ID,
  // UAT: https://api-preprod.phonepe.com/apis/pg-sandbox
  // Production: https://api.phonepe.com/apis/hermes
  apiUrl: import.meta.env.VITE_PHONEPE_API_URL,
  redirectUrl: import.meta.env.VITE_APP_URL || window.location.origin,
};

function isLiveTruckOptiSite(): boolean {
  if (typeof window === 'undefined') return false;
  return ['truckopti.in', 'www.truckopti.in'].includes(window.location.hostname);
}

function getPhonePeConfigError(): string | null {
  if (isUnset(PHONEPE_CONFIG.merchantId)) return 'Missing VITE_PHONEPE_MERCHANT_ID';
  if (isUnset(PHONEPE_CONFIG.apiUrl)) return 'Missing VITE_PHONEPE_API_URL';
  return null;
}

function isPhonePeNonProductionUrl(value?: string): boolean {
  const lowered = (value || '').toLowerCase();
  return lowered.includes('sandbox') || lowered.includes('preprod');
}

function getSafePhonePeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('err_name_not_resolved') ||
    message.includes('load failed')
  ) {
    return 'PhonePe payment service is currently unreachable. Please try again later.';
  }

  return 'Unable to start PhonePe payment right now. Please try Razorpay or contact support.';
}

export interface PhonePePaymentRequest {
  amount: number; // in paise
  orderId: string;
  userId: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  customerPhone: string;
  customerEmail?: string;
}

export interface PhonePePaymentResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantId: string;
    merchantTransactionId: string;
    instrumentResponse?: {
      type: string;
      redirectInfo?: {
        url: string;
        method: string;
      };
    };
  };
}

// Initiate PhonePe UPI Payment via Edge Function
export async function initiatePhonePePayment(request: PhonePePaymentRequest): Promise<PhonePePaymentResponse> {
  const configError = getPhonePeConfigError();
  if (configError) {
    return {
      success: false,
      code: 'CONFIG_ERROR',
      message: `PhonePe is not configured: ${configError}`,
    };
  }

  if (isLiveTruckOptiSite() && getPaymentConfig().isTestMode) {
    return {
      success: false,
      code: 'CONFIG_ERROR',
      message: 'PhonePe live payments are not enabled yet. Please contact support.',
    };
  }

  const merchantTransactionId = `TRK${Date.now()}${Math.random().toString(36).substring(7)}`;

  try {
    // Store pending transaction in Supabase
    await supabase.from('payment_history').insert({
      user_id: request.userId,
      amount: request.amount,
      currency: 'INR',
      payment_method: 'upi',
      status: 'pending',
      razorpay_order_id: merchantTransactionId, // Using this field for PhonePe txn ID
      metadata: {
        plan_id: request.planId,
        billing_cycle: request.billingCycle,
        phonepe_merchant_txn_id: merchantTransactionId,
      },
    });

    // Call Supabase Edge Function to generate checksum and get redirect URL
    const { data, error } = await supabase.functions.invoke('phonepe-checkout', {
      body: {
        merchantId: PHONEPE_CONFIG.merchantId,
        merchantTransactionId,
        merchantUserId: request.userId.substring(0, 36),
        amount: request.amount,
        redirectUrl: `${PHONEPE_CONFIG.redirectUrl}/payment/callback?txnId=${merchantTransactionId}`,
        redirectMode: 'REDIRECT',
        callbackUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phonepe-webhook`,
        mobileNumber: request.customerPhone.replace(/\D/g, '').slice(-10),
      },
    });

    if (error) throw error;

    // Redirect to PhonePe payment page
    if (data?.redirectUrl) {
      window.location.href = data.redirectUrl;
    }

    return {
      success: true,
      code: 'PAYMENT_INITIATED',
      message: 'Redirecting to PhonePe...',
      data: {
        merchantId: PHONEPE_CONFIG.merchantId || '',
        merchantTransactionId,
      },
    };
  } catch (error) {
    return {
      success: false,
      code: 'PAYMENT_ERROR',
      message: getSafePhonePeFailureMessage(error),
    };
  }
}

// Check payment status via Edge Function
export async function checkPaymentStatus(merchantTransactionId: string): Promise<{
  success: boolean;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PhonePe Edge Function response is dynamically typed
  data?: any;
}> {
  try {
    // Call Supabase Edge Function for status check
    const { data, error } = await supabase.functions.invoke('phonepe-status', {
      body: {
        merchantId: PHONEPE_CONFIG.merchantId,
        merchantTransactionId,
      },
    });

    if (error) throw error;

    let status: 'PENDING' | 'SUCCESS' | 'FAILED' = 'PENDING';
    if (data?.code === 'PAYMENT_SUCCESS') {
      status = 'SUCCESS';
    } else if (data?.code === 'PAYMENT_ERROR' || data?.code === 'PAYMENT_DECLINED') {
      status = 'FAILED';
    }

    return {
      success: data?.success ?? false,
      status,
      message: data?.message || '',
      data: data?.data,
    };
  } catch (_error) {
    return {
      success: false,
      status: 'PENDING',
      message: 'Unable to check payment status',
    };
  }
}

// Verify and activate subscription after successful payment
export async function verifyAndActivateSubscription(
  merchantTransactionId: string,
  userId: string,
  planId: string,
  billingCycle: 'monthly' | 'yearly'
): Promise<{ success: boolean; message: string }> {
  const statusResult = await checkPaymentStatus(merchantTransactionId);

  if (statusResult.status !== 'SUCCESS') {
    return {
      success: false,
      message: statusResult.message || 'Payment not successful',
    };
  }

  try {
    // Call Supabase edge function to create subscription
    const { error } = await supabase.functions.invoke('verify-payment', {
      body: {
        razorpay_payment_id: statusResult.data?.transactionId || merchantTransactionId,
        razorpay_order_id: merchantTransactionId,
        plan_id: planId,
        billing_cycle: billingCycle,
        user_id: userId,
        payment_provider: 'phonepe',
      },
    });

    if (error) throw error;

    return {
      success: true,
      message: 'Subscription activated successfully!',
    };
  } catch (_error) {
    return {
      success: false,
      message: 'Payment successful but subscription activation failed. Please contact support.',
    };
  }
}

// Export payment config for UI
export const getPaymentConfig = () => ({
  merchantId: PHONEPE_CONFIG.merchantId || '',
  isConfigured: !getPhonePeConfigError(),
  isTestMode: isPhonePeNonProductionUrl(PHONEPE_CONFIG.apiUrl),
  isLaunchReady: !getPhonePeConfigError() && !isPhonePeNonProductionUrl(PHONEPE_CONFIG.apiUrl),
  launchBlocker: getPhonePeConfigError() || (isPhonePeNonProductionUrl(PHONEPE_CONFIG.apiUrl) ? 'PhonePe is still using sandbox/preprod' : null),
});
