import { supabase } from '../lib/supabase';
import { PRICING_TIERS, type PricingTier } from '../config/pricing';
import { FALLBACK_PLAN_PRICES_PAISE, parseEntitlement, parseTrialError, type Entitlement } from '../lib/billingState';

// ============= SUBSCRIPTION PLAN TYPES =============
export interface SubscriptionPlan {
  id: string;
  name: string;
  name_hi: string;
  tier: 'starter' | 'growth' | 'professional' | 'enterprise';
  price_monthly: number;
  price_yearly: number;
  trucks_limit: number;
  shipments_monthly: number;
  users_limit: number;
  storage_gb: number;
  api_calls_monthly: number;
  sms_included: number;
  maps_requests_monthly: number;
  support_level: 'email' | 'chat' | 'priority' | 'dedicated';
  features: string[];
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'trial' | 'past_due' | 'grace';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  razorpay_subscription_id?: string;
  razorpay_customer_id?: string;
}

export interface UsageTracking {
  id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  shipments_used: number;
  api_calls_used: number;
  sms_sent: number;
  maps_requests: number;
  storage_used_mb: number;
}

export interface Invoice {
  id: string;
  subscription_id: string;
  user_id: string;
  invoice_number: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  billing_period_start: string;
  billing_period_end: string;
  razorpay_invoice_id?: string;
  razorpay_payment_id?: string;
  paid_at?: string;
  pdf_url?: string;
}

function mapPlanFeatures(features: unknown): string[] {
  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features)
      return Array.isArray(parsed) ? parsed.filter((feature): feature is string => typeof feature === 'string') : []
    } catch {
      return []
    }
  }

  return Array.isArray(features) ? features.filter((feature): feature is string => typeof feature === 'string') : []
}

function mapSupportLevel(level: PricingTier['limits']['supportLevel']): SubscriptionPlan['support_level'] {
  return level === 'community' ? 'email' : level
}

function mapPricingTierToSubscriptionPlan(tier: PricingTier): SubscriptionPlan {
  return {
    id: tier.id,
    name: tier.name,
    name_hi: tier.name,
    tier: tier.id as SubscriptionPlan['tier'],
    price_monthly: FALLBACK_PLAN_PRICES_PAISE[tier.id]?.monthly ?? tier.monthlyPrice * 100,
    price_yearly: FALLBACK_PLAN_PRICES_PAISE[tier.id]?.yearly ?? tier.yearlyPrice * 100,
    trucks_limit: tier.limits.trucksManaged,
    shipments_monthly: tier.limits.shipmentsPerMonth,
    users_limit: tier.limits.users,
    storage_gb: tier.limits.storageGB,
    api_calls_monthly: tier.limits.apiCallsPerMonth,
    sms_included: tier.limits.smsOtpPerMonth,
    maps_requests_monthly: tier.limits.routeOptimizations,
    support_level: mapSupportLevel(tier.limits.supportLevel),
    features: tier.features,
    is_active: true,
  };
}

function getFallbackPlan(identifier: string): SubscriptionPlan | null {
  const matchedTier = PRICING_TIERS.find((tier) => tier.id === identifier)
  return matchedTier ? mapPricingTierToSubscriptionPlan(matchedTier) : null
}

// ============= SUBSCRIPTION PLANS API =============
export const subscriptionPlansApi = {
  // Get all active plans
  async getAll(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true });

    if (error) throw error;
    return (data || []).map(plan => ({
      ...plan,
      features: mapPlanFeatures(plan.features)
    }));
  },

  // Get plan by tier
  async getByTier(tier: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('tier', tier)
      .single();

    if (error) return getFallbackPlan(tier);
    return {
      ...data,
      features: mapPlanFeatures(data.features)
    };
  },

  // Get plan by ID
  async getById(id: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return await this.getByTier(id) || getFallbackPlan(id);
    }

    if (!data) {
      return await this.getByTier(id) || getFallbackPlan(id);
    }

    return {
      ...data,
      features: mapPlanFeatures(data.features)
    };
  }
};

// ============= ENTITLEMENT (the only read path) =============
// TO-152: the subscriptions and usage tables are no longer readable by the
// client. agency_subscription_entitlement() is the single read path.
export class TrialError extends Error {
  code: ReturnType<typeof parseTrialError>;
  constructor(code: ReturnType<typeof parseTrialError>, message: string) {
    super(message);
    this.name = 'TrialError';
    this.code = code;
  }
}

export const entitlementApi = {
  async get(): Promise<Entitlement> {
    const { data, error } = await supabase.rpc('agency_subscription_entitlement');
    if (error) throw error;
    return parseEntitlement(data);
  },

  // Owner-only, server-enforced. Typed errors: identity_required,
  // trial_already_claimed, forbidden_scope.
  async startTrial(): Promise<Entitlement> {
    const { data, error } = await supabase.rpc('agency_subscription_start_trial');
    if (error) throw new TrialError(parseTrialError(error), error.message);
    const payload = data as { ok?: boolean; error?: string } | null;
    if (payload && payload.ok === false) {
      throw new TrialError(parseTrialError(payload), payload.error ?? 'trial_failed');
    }
    return entitlementApi.get();
  },
};

function entitlementToLegacySubscription(ent: Entitlement): Subscription | null {
  // Legacy callers only know live, usable subscriptions. past_due still has
  // full access (banner only), so it maps to active; grace/expired/none do not.
  if (ent.status !== 'trial' && ent.status !== 'active' && ent.status !== 'past_due') return null;
  const end = ent.status === 'trial' ? (ent.trialEnd ?? ent.periodEnd) : ent.periodEnd;
  return {
    id: ent.agencyId ?? '',
    user_id: '',
    plan_id: ent.planTier ?? '',
    status: ent.status === 'past_due' ? 'active' : ent.status,
    billing_cycle: 'monthly',
    current_period_start: '',
    current_period_end: end ?? new Date(0).toISOString(),
    trial_end: ent.trialEnd ?? undefined,
    cancel_at_period_end: false,
  };
}

// ============= SUBSCRIPTIONS API =============
export const subscriptionsApi = {
  // Get the agency's live subscription (legacy shape, read through the RPC)
  async getCurrent(): Promise<Subscription | null> {
    try {
      return entitlementToLegacySubscription(await entitlementApi.get());
    } catch {
      return null;
    }
  },

  // Get subscription with plan details
  async getCurrentWithPlan(): Promise<{ subscription: Subscription; plan: SubscriptionPlan } | null> {
    const subscription = await this.getCurrent();
    if (!subscription) return null;

    const plan = await subscriptionPlansApi.getById(subscription.plan_id);
    if (!plan) return null;

    return { subscription, plan };
  },

  // Create new subscription (called after payment)
  async create(_planId: string, _billingCycle: 'monthly' | 'yearly', _razorpayData?: {
    subscription_id: string;
    customer_id: string;
  }): Promise<Subscription> {
    throw new Error('Direct client subscription creation is disabled. Use the secure checkout flow.');
  },

  // Start trial (server-managed RPC; owner only)
  async startTrial(): Promise<Entitlement> {
    return entitlementApi.startTrial();
  },

  // Cancel subscription
  async cancel(_immediate: boolean = false): Promise<void> {
    throw new Error('Direct client subscription cancellation is disabled. Use a server-managed billing workflow.');
  },

  // Upgrade/Downgrade plan
  async changePlan(_newPlanId: string): Promise<Subscription> {
    throw new Error('Direct client plan changes are disabled. Use the secure checkout flow.');
  }
};

// ============= USAGE TRACKING API =============
export const usageApi = {
  // Current usage, read from the entitlement RPC (no usage_tracking read)
  async getCurrent(): Promise<UsageTracking | null> {
    try {
      const ent = await entitlementApi.get();
      if (!entitlementToLegacySubscription(ent)) return null;
      return {
        id: ent.agencyId ?? '',
        subscription_id: ent.agencyId ?? '',
        period_start: '',
        period_end: ent.periodEnd ?? '',
        shipments_used: ent.usage.orders_month,
        api_calls_used: 0,
        sms_sent: 0,
        maps_requests: 0,
        storage_used_mb: 0,
      };
    } catch {
      return null;
    }
  },

  // Check if user can perform action (within limits)
  async canUse(resource: 'shipments' | 'api_calls' | 'sms' | 'maps'): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .rpc('check_usage_limit', { p_user_id: user.id, p_resource: resource });

    if (error) return false;
    return data;
  },

  // Increment usage counter
  async increment(resource: 'shipments' | 'api_calls' | 'sms' | 'maps', amount: number = 1): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .rpc('increment_usage', { p_user_id: user.id, p_resource: resource, p_amount: amount });
  },

  // No client read path for usage history after TO-152.
  async getHistory(): Promise<UsageTracking[]> {
    return [];
  }
};

// ============= CHECKOUT (the server prices everything) =============
export interface CheckoutOrderRequest {
  plan_tier: 'starter' | 'growth' | 'professional';
  billing_cycle: 'monthly' | 'yearly';
  coupon_code?: string;
}

// Order as returned by the Edge function. amount is the server's figure,
// shown to the buyer and handed to Razorpay Checkout; never computed here.
export interface CheckoutOrder {
  id: string;
  amount: number;
  currency: string;
}

export const checkoutApi = {
  async createOrder(request: CheckoutOrderRequest): Promise<CheckoutOrder> {
    const coupon = request.coupon_code?.trim();
    const body: Record<string, string> = {
      plan_tier: request.plan_tier,
      billing_cycle: request.billing_cycle,
    };
    if (coupon) body.coupon_code = coupon.toUpperCase();

    const { data, error } = await supabase.functions.invoke<Partial<CheckoutOrder> & { error?: string }>(
      'create-razorpay-order',
      { body },
    );
    if (error || !data?.id) {
      throw new Error(data?.error || 'Unable to start payment right now. Please try again.');
    }
    return { id: data.id, amount: Number(data.amount ?? 0), currency: data.currency || 'INR' };
  },

  // Asks the server to verify the signature. The result is never treated as
  // activation: callers refetch the entitlement instead.
  async verifyPayment(payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<void> {
    try {
      await supabase.functions.invoke('verify-razorpay-payment', { body: payload });
    } catch {
      // The webhook is the backstop; polling decides what the buyer sees.
    }
  },
};

// ============= INVOICES API =============
export const invoicesApi = {
  // Get all invoices for current user
  async getAll(): Promise<Invoice[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  },

  // Get invoice by ID
  async getById(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  },

  // Download invoice PDF
  // TO-142: the billing-documents bucket is private — a fresh, expiring
  // signed URL is minted per request through the invoice-view Edge function
  // (owner or DB admin). Stored pdf_url values are no longer opened directly.
  async downloadPdf(invoiceId: string): Promise<string | null> {
    return this.getSignedUrl(invoiceId);
  },

  // Mint a fresh expiring signed URL for the invoice document.
  async getSignedUrl(invoiceId: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke<{
      signedUrl: string | null;
      expiresIn: number;
    }>('invoice-view', { body: { invoiceId } });

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
};

// ============= HELPER FUNCTIONS =============
export const subscriptionHelpers = {
  // Format price from paise to rupees
  formatPrice(paise: number): string {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  },

  // Check if user has active subscription
  async hasActiveSubscription(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .rpc('has_active_subscription', { p_user_id: user.id });

    if (error) return false;
    return data;
  },

  // Get remaining days in current period
  getRemainingDays(subscription: Subscription): number {
    const end = new Date(subscription.current_period_end);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },

  // Check if subscription is in trial
  isInTrial(subscription: Subscription): boolean {
    return subscription.status === 'trial';
  },

  // Get usage percentage
  getUsagePercentage(used: number, limit: number): number {
    if (limit === -1) return 0; // Unlimited
    if (limit <= 0) return 0; // Zero or non-positive finite limits
    return Math.min(100, Math.round((used / limit) * 100));
  }
};

// Export all APIs
export const subscriptionApi = {
  plans: subscriptionPlansApi,
  subscriptions: subscriptionsApi,
  entitlement: entitlementApi,
  checkout: checkoutApi,
  usage: usageApi,
  invoices: invoicesApi,
  helpers: subscriptionHelpers
};

export default subscriptionApi;
