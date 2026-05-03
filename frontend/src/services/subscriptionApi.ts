import { supabase } from '../lib/supabase';

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
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'trial';
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
      features: typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features
    }));
  },

  // Get plan by tier
  async getByTier(tier: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('tier', tier)
      .single();

    if (error) return null;
    return {
      ...data,
      features: typeof data.features === 'string' ? JSON.parse(data.features) : data.features
    };
  },

  // Get plan by ID
  async getById(id: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return {
      ...data,
      features: typeof data.features === 'string' ? JSON.parse(data.features) : data.features
    };
  }
};

// ============= SUBSCRIPTIONS API =============
export const subscriptionsApi = {
  // Get current user's subscription
  async getCurrent(): Promise<Subscription | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data;
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

  // Start trial
  async startTrial(_planId: string): Promise<Subscription> {
    throw new Error('Direct client trial activation is disabled. Use a server-managed trial flow.');
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
  // Get current period usage
  async getCurrent(): Promise<UsageTracking | null> {
    const subscription = await subscriptionsApi.getCurrent();
    if (!subscription) return null;

    const { data, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('subscription_id', subscription.id)
      .lte('period_start', new Date().toISOString())
      .gte('period_end', new Date().toISOString())
      .single();

    if (error) return null;
    return data;
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

  // Get usage history
  async getHistory(): Promise<UsageTracking[]> {
    const subscription = await subscriptionsApi.getCurrent();
    if (!subscription) return [];

    const { data, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('subscription_id', subscription.id)
      .order('period_start', { ascending: false })
      .limit(12);

    if (error) return [];
    return data || [];
  }
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
  async downloadPdf(invoiceId: string): Promise<string | null> {
    const invoice = await this.getById(invoiceId);
    return invoice?.pdf_url || null;
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
    return Math.min(100, Math.round((used / limit) * 100));
  }
};

// Export all APIs
export const subscriptionApi = {
  plans: subscriptionPlansApi,
  subscriptions: subscriptionsApi,
  usage: usageApi,
  invoices: invoicesApi,
  helpers: subscriptionHelpers
};

export default subscriptionApi;
