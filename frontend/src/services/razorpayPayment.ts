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
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
}

// Load Razorpay script dynamically
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
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
  return {
    keyId: RAZORPAY_CONFIG.keyId || '',
    isConfigured: !isUnset(RAZORPAY_CONFIG.keyId),
    isTestMode: RAZORPAY_CONFIG.isTestMode,
  };
}

// Create order on server (Edge Function)
async function createServerOrder(request: RazorpayPaymentRequest): Promise<{ orderId: string; error?: string }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency || 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes: {
          user_id: request.userId,
          plan_id: request.planId,
          billing_cycle: request.billingCycle,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { orderId: '', error: error.error || 'Failed to create order' };
    }

    const order = await response.json();
    return { orderId: order.id };
  } catch (error) {
    logger.error('Error creating server order:', error);
    return { orderId: '', error: 'Failed to create payment order' };
  }
}

// Initiate Razorpay Payment
export async function initiateRazorpayPayment(
  request: RazorpayPaymentRequest
): Promise<RazorpayPaymentResult> {
  if (isUnset(RAZORPAY_CONFIG.keyId)) {
    return {
      success: false,
      error: 'Razorpay is not configured. Missing VITE_RAZORPAY_KEY_ID.',
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
    // Fallback to client-side order if server fails
    logger.warn('Server order failed, using client-side order');
  }

  const orderId = serverOrderId || request.orderId || `order_${Date.now()}`;
  
  // Store pending transaction in Supabase
  try {
    await supabase.from('payment_history').insert({
      user_id: request.userId,
      amount: request.amount,
      currency: request.currency || 'INR',
      payment_method: 'upi',
      status: 'pending',
      razorpay_order_id: orderId,
      metadata: {
        plan_id: request.planId,
        billing_cycle: request.billingCycle,
        description: request.description,
      },
    });
  } catch (error) {
    logger.warn('Could not store pending payment:', error);
  }

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
      handler: async function (response: any) {
        // Payment successful
        try {
          await supabase
            .from('payment_history')
            .update({
              status: 'completed',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            .eq('razorpay_order_id', orderId);
        } catch (error) {
          logger.warn('Could not update payment status:', error);
        }

        // Verify payment and activate subscription server-side
        try {
          await supabase.functions.invoke('verify-razorpay-payment', {
            body: {
              razorpay_order_id: orderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: request.planId || '',
              billing_cycle: request.billingCycle || 'monthly',
              customer_phone: request.customerPhone,
              customer_email: request.customerEmail,
            },
          });
        } catch (verifyError) {
          logger.warn('Could not verify payment server-side:', verifyError);
        }

        resolve({
          success: true,
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: function () {
          resolve({ success: false, error: 'Payment cancelled by user' });
        },
      },
    };

    try {
      const razorpay = new (window as any).Razorpay(options);
      razorpay.on('payment.failed', async function (response: any) {
        try {
          await supabase
            .from('payment_history')
            .update({
              status: 'failed',
              metadata: { error: response.error },
            })
            .eq('razorpay_order_id', orderId);
        } catch (error) {
          logger.warn('Could not update payment status:', error);
        }

        resolve({
          success: false,
          error: response.error?.description || 'Payment failed',
        });
      });
      razorpay.open();
    } catch (error) {
      resolve({ success: false, error: 'Failed to open Razorpay checkout' });
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
