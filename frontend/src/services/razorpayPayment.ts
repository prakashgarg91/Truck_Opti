import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

function isUnset(value?: string): boolean {
  if (!value) return true;
  const normalized = value.trim();
  return (
    normalized.length === 0 ||
    normalized.toUpperCase().includes('REPLACE_ME') ||
    normalized.toUpperCase().includes('YOUR_')
  );
}

// Razorpay Configuration
// Payment verification must happen via Supabase Edge Function
const RAZORPAY_CONFIG = {
  keyId: import.meta.env.VITE_RAZORPAY_KEY_ID,
  isTestMode: (import.meta.env.VITE_RAZORPAY_KEY_ID || '').includes('test'),
};

function isLiveTruckOptiSite(): boolean {
  if (typeof window === 'undefined') return false;
  return ['truckopti.in', 'www.truckopti.in'].includes(window.location.hostname);
}

export interface RazorpayPaymentRequest {
  amount: number; // in paise
  currency?: string;
  orderId?: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone: string;
  userId: string;
  planId?: string;
  billingCycle?: 'monthly' | 'yearly';
}

export interface RazorpayPaymentResult {
  success: boolean;
  status?: 'success' | 'pending' | 'failed';
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
}

// Load Razorpay script dynamically
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay SDK is loaded via CDN; no type declarations available
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Get Razorpay configuration info
export function getRazorpayConfig() {
  const isConfigured = !isUnset(RAZORPAY_CONFIG.keyId);
  const isLaunchReady = isConfigured && !RAZORPAY_CONFIG.isTestMode;

  return {
    keyId: RAZORPAY_CONFIG.keyId || '',
    isConfigured,
    isTestMode: RAZORPAY_CONFIG.isTestMode,
    isLaunchReady,
    launchBlocker: isLaunchReady
      ? null
      : !isConfigured
        ? 'Missing VITE_RAZORPAY_KEY_ID'
        : 'Razorpay is still using a test key',
  };
}

// Create order on server (Edge Function)
async function createServerOrder(request: RazorpayPaymentRequest): Promise<{ orderId: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke<{ id?: string }>('create-razorpay-order', {
      body: {
        amount: request.amount,
        currency: request.currency || 'INR',
        receipt: `rcpt_${Date.now()}`,
        customerPhone: request.customerPhone,
        customerEmail: request.customerEmail,
        notes: {
          user_id: request.userId,
          plan_id: request.planId,
          billing_cycle: request.billingCycle,
        },
      },
    });

    if (error) {
      logger.error('Error creating server order:', error);
      return { orderId: '', error: error.message || 'Failed to create order' };
    }

    if (!data?.id) {
      return { orderId: '', error: 'Failed to create order' };
    }

    return { orderId: data.id };
  } catch (error) {
    logger.error('Error creating server order:', error);
    return { orderId: '', error: 'Failed to create payment order' };
  }
}

// Initiate Razorpay Payment
export async function initiateRazorpayPayment(
  request: RazorpayPaymentRequest
): Promise<RazorpayPaymentResult> {
  const config = getRazorpayConfig();

  if (!config.isConfigured) {
    return {
      success: false,
      error: 'Razorpay is not configured. Missing VITE_RAZORPAY_KEY_ID.',
    };
  }

  if (isLiveTruckOptiSite() && !config.isLaunchReady) {
    return {
      success: false,
      error: 'Razorpay live payments are not enabled yet. Please contact support.',
    };
  }

  // Load Razorpay script
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    return { success: false, error: 'Failed to load Razorpay SDK' };
  }

  // Create order on server for security
  const { orderId: serverOrderId, error: orderError } = await createServerOrder(request);
  if (orderError || !serverOrderId) {
    return {
      success: false,
      error: orderError || 'Failed to create payment order',
    };
  }

  const orderId = serverOrderId;

  return new Promise((resolve) => {
    const options = {
      key: RAZORPAY_CONFIG.keyId,
      amount: request.amount,
      currency: request.currency || 'INR',
      name: 'TruckOpti',
      description: request.description,
      order_id: orderId,
      prefill: {
        name: request.customerName || '',
        email: request.customerEmail || '',
        contact: request.customerPhone,
      },
      notes: {
        user_id: request.userId,
        plan_id: request.planId || '',
        billing_cycle: request.billingCycle || '',
      },
      theme: {
        color: '#f97316', // Orange
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay SDK handler response type is untyped (CDN-loaded)
      handler: async function (response: any) {
        // Verify payment and activate subscription server-side
        try {
          const { data: verificationResult, error: verifyError } = await supabase.functions.invoke<{ success?: boolean; error?: string }>('verify-razorpay-payment', {
            body: {
              razorpay_order_id: orderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              customer_phone: request.customerPhone,
              customer_email: request.customerEmail,
            },
          });

          if (verifyError || !verificationResult?.success) {
            logger.warn('Could not verify payment server-side:', verifyError || verificationResult);
            resolve({
              success: false,
              status: 'pending',
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
              error: verificationResult?.error || verifyError?.message || 'Payment completed, but subscription verification is still pending.',
            });
            return;
          }
        } catch (verifyError) {
          logger.warn('Could not verify payment server-side:', verifyError);
          resolve({
            success: false,
            status: 'pending',
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id,
            signature: response.razorpay_signature,
            error: 'Payment completed, but subscription verification is still pending.',
          });
          return;
        }

        resolve({
          success: true,
          status: 'success',
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: function () {
          resolve({ success: false, status: 'failed', error: 'Payment cancelled by user' });
        },
      },
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay SDK loaded via CDN; no official TS declarations
      const razorpay = new (window as any).Razorpay(options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay SDK event payload type
      razorpay.on('payment.failed', function (response: any) {
        resolve({
          success: false,
          status: 'failed',
          error: response.error?.description || 'Payment failed',
        });
      });
      razorpay.open();
    } catch (_error) {
      resolve({ success: false, status: 'failed', error: 'Failed to open Razorpay checkout' });
    }
  });
}

// Test cards for Razorpay sandbox
export const RAZORPAY_TEST_CARDS = {
  success: {
    number: '4111111111111111',
    expiry: '12/25',
    cvv: '123',
    name: 'Test User',
  },
  failure: {
    number: '4000000000000002',
    expiry: '12/25',
    cvv: '123',
    name: 'Test User',
  },
  upi: {
    vpa: 'success@razorpay', // Use this UPI ID for successful test payments
  },
};
