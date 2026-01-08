import { supabase } from '../lib/supabase';
import CryptoJS from 'crypto-js';

// PhonePe Configuration
const PHONEPE_CONFIG = {
  // Use test credentials for development, production for live
  merchantId: import.meta.env.VITE_PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT',
  saltKey: import.meta.env.VITE_PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
  saltIndex: import.meta.env.VITE_PHONEPE_SALT_INDEX || '1',
  // UAT: https://api-preprod.phonepe.com/apis/pg-sandbox
  // Production: https://api.phonepe.com/apis/hermes
  apiUrl: import.meta.env.VITE_PHONEPE_API_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  redirectUrl: import.meta.env.VITE_APP_URL || window.location.origin,
};

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

// Generate SHA256 hash for PhonePe
function generateChecksum(payload: string, endpoint: string): string {
  const base64Payload = btoa(payload);
  const string = base64Payload + endpoint + PHONEPE_CONFIG.saltKey;
  const sha256Hash = CryptoJS.SHA256(string).toString();
  return sha256Hash + '###' + PHONEPE_CONFIG.saltIndex;
}

// Initiate PhonePe UPI Payment
export async function initiatePhonePePayment(request: PhonePePaymentRequest): Promise<PhonePePaymentResponse> {
  const merchantTransactionId = `TRK${Date.now()}${Math.random().toString(36).substring(7)}`;
  
  const payload = {
    merchantId: PHONEPE_CONFIG.merchantId,
    merchantTransactionId,
    merchantUserId: request.userId.substring(0, 36),
    amount: request.amount,
    redirectUrl: `${PHONEPE_CONFIG.redirectUrl}/payment/callback?txnId=${merchantTransactionId}`,
    redirectMode: 'REDIRECT',
    callbackUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/phonepe-webhook`,
    mobileNumber: request.customerPhone.replace(/\D/g, '').slice(-10),
    paymentInstrument: {
      type: 'PAY_PAGE',
    },
  };

  const base64Payload = btoa(JSON.stringify(payload));
  const endpoint = '/pg/v1/pay';
  const checksum = generateChecksum(JSON.stringify(payload), endpoint);

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

    const response = await fetch(`${PHONEPE_CONFIG.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('PhonePe payment initiation failed:', error);
    return {
      success: false,
      code: 'PAYMENT_ERROR',
      message: error instanceof Error ? error.message : 'Payment initiation failed',
    };
  }
}

// Check payment status
export async function checkPaymentStatus(merchantTransactionId: string): Promise<{
  success: boolean;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  message: string;
  data?: any;
}> {
  const endpoint = `/pg/v1/status/${PHONEPE_CONFIG.merchantId}/${merchantTransactionId}`;
  const string = endpoint + PHONEPE_CONFIG.saltKey;
  const sha256Hash = CryptoJS.SHA256(string).toString();
  const checksum = sha256Hash + '###' + PHONEPE_CONFIG.saltIndex;

  try {
    const response = await fetch(`${PHONEPE_CONFIG.apiUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': PHONEPE_CONFIG.merchantId,
      },
    });

    const result = await response.json();
    
    let status: 'PENDING' | 'SUCCESS' | 'FAILED' = 'PENDING';
    if (result.code === 'PAYMENT_SUCCESS') {
      status = 'SUCCESS';
    } else if (result.code === 'PAYMENT_ERROR' || result.code === 'PAYMENT_DECLINED') {
      status = 'FAILED';
    }

    return {
      success: result.success,
      status,
      message: result.message,
      data: result.data,
    };
  } catch (error) {
    console.error('Payment status check failed:', error);
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
  } catch (error) {
    console.error('Subscription activation failed:', error);
    return {
      success: false,
      message: 'Payment successful but subscription activation failed. Please contact support.',
    };
  }
}

// Export payment config for UI
export const getPaymentConfig = () => ({
  merchantId: PHONEPE_CONFIG.merchantId,
  isTestMode: PHONEPE_CONFIG.apiUrl.includes('sandbox'),
});
