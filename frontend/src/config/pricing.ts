// TruckOpti Subscription Pricing Model
// Cost + 60% Margin Strategy for Indian Market

export interface PricingTier {
  id: string
  name: string
  monthlyPrice: number // INR
  yearlyPrice: number // INR (with discount)
  features: string[]
  limits: {
    users: number
    trucksManaged: number
    shipmentsPerMonth: number
    packingOptimizations: number
    routeOptimizations: number
    storageGB: number
    apiCallsPerMonth: number
    smsOtpPerMonth: number
    supportLevel: 'community' | 'email' | 'chat' | 'priority' | 'dedicated'
  }
  targetAudience: string
}

// ============= COST BREAKDOWN (Monthly) =============
export const COST_STRUCTURE = {
  // Infrastructure Costs
  infrastructure: {
    supabase: {
      free: 0,
      pro: 1875, // $25/month ≈ ₹2,083 → using ₹1,875 for calculation
      team: 30000, // $399/month
    },
    vercel: {
      hobby: 0,
      pro: 1500, // $20/month
      enterprise: 30000,
    },
    domain_ssl: 100, // Monthly amortized
    cdn_bandwidth: {
      perGB: 0.5, // ₹0.50 per GB
    },
  },

  // Per-Transaction Costs
  perTransaction: {
    sms_otp: 0.25, // ₹0.25 per SMS (MSG91 India rates)
    google_maps_geocoding: 0.37, // ₹0.37 per request ($5/1000)
    google_maps_directions: 0.37, // ₹0.37 per request
    google_maps_distance_matrix: 0.37,
    email_notification: 0.02, // ₹0.02 per email
  },

  // Support Costs (Monthly per customer)
  support: {
    community: 0,
    email: 200, // 30 min/month avg support time
    priority: 800, // 2 hours/month
    dedicated: 5000, // Dedicated account manager allocation
  },

  // Development Amortization (spread over 36 months, 1000 expected customers)
  developmentAmortization: {
    totalInvestment: 5000000, // ₹50 Lakhs development
    monthlyPerCustomer: 139, // ₹5,000,000 / 36 / 1000
  },

  // Compliance & Security
  compliance: {
    gdpr_tools: 500, // Monthly
    security_audits: 833, // ₹10,000/year amortized
    backup_disaster_recovery: 300,
  },
}

// ============= MARGIN CALCULATION =============
const MARGIN_MULTIPLIER = 1.60 // Cost + 60% margin

export function calculatePrice(baseCost: number): number {
  return Math.ceil(baseCost * MARGIN_MULTIPLIER / 100) * 100 // Round to nearest 100
}

// ============= TIER COST CALCULATIONS =============
export const tierCosts = {
  starter: {
    infrastructure: 0 + 0 + 100, // Free Supabase + Vercel Hobby + Domain
    avgSmsPerMonth: 100 * 0.25, // 100 OTPs
    avgMapsRequests: 50 * 0.37, // 50 route calculations
    support: 0,
    devAmortization: 139,
    compliance: 50, // Shared compliance costs
    // Total: ₹325.50
  },
  growth: {
    infrastructure: 1875 + 1500 + 100, // Pro Supabase + Pro Vercel
    avgSmsPerMonth: 500 * 0.25,
    avgMapsRequests: 300 * 0.37,
    support: 200,
    devAmortization: 139,
    compliance: 200,
    // Total: ₹4,225.50
  },
  professional: {
    infrastructure: 1875 + 1500 + 100,
    avgSmsPerMonth: 2000 * 0.25,
    avgMapsRequests: 1000 * 0.37,
    support: 800,
    devAmortization: 139,
    compliance: 500,
    // Total: ₹5,784
  },
  enterprise: {
    infrastructure: 30000 + 30000 + 100, // Team Supabase + Enterprise Vercel
    avgSmsPerMonth: 10000 * 0.25,
    avgMapsRequests: 5000 * 0.37,
    support: 5000,
    devAmortization: 139,
    compliance: 1633,
    // Total: ₹71,222
  },
}

// ============= PRICING TIERS =============
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 499, // Launch pricing
    yearlyPrice: 4990, // Launch pricing
    features: [
      '3D Bin Packing Optimization',
      'Truck catalogue (7 types)',
      'Manual Route Planning',
      'Email Support',
      'Mobile App Access',
      'Basic Reports',
      'English UI',
    ],
    limits: {
      users: 2,
      trucksManaged: 3,
      shipmentsPerMonth: 50,
      packingOptimizations: 100,
      routeOptimizations: 20,
      storageGB: 1,
      apiCallsPerMonth: 1000,
      smsOtpPerMonth: 100,
      supportLevel: 'email',
    },
    targetAudience: 'Small transporters, single-truck owners',
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 1999, // Cost ₹4,225 × 1.6 = ₹6,760, but priced competitively
    yearlyPrice: 19990, // 10 x monthly (two months free)
    features: [
      'Everything in Starter +',
      'Smart Truck Recommendation AI',
      'Full Indian truck catalogue',
      'Route planning with estimated fuel and toll costs',
      'Real-time GPS Tracking',
      'Customer Management (CRM)',
      'GST Invoice Generation',
      'Chat support',
      'Advanced Analytics Dashboard',
      'CSV/Excel Import-Export',
    ],
    limits: {
      users: 10,
      trucksManaged: 20,
      shipmentsPerMonth: 500, // matches subscription_plans seed
      packingOptimizations: 500,
      routeOptimizations: 100,
      storageGB: 5,
      apiCallsPerMonth: 10000,
      smsOtpPerMonth: 500,
      supportLevel: 'chat',
    },
    targetAudience: 'Growing logistics companies, fleet owners (5-20 trucks)',
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 4999, // Cost ₹5,784 × 1.6 = ₹9,254
    yearlyPrice: 49990, // 10 x monthly (two months free)
    features: [
      'Everything in Growth +',
      'Multi-location Support',
      'Three 3D packing methods',
      'Live Location Sharing with Customers',
      'Driver Mobile App',
      'Fuel Cost Optimization',
      'Priority support',
      'Custom Branding',
    ],
    limits: {
      users: 25,
      trucksManaged: 50,
      shipmentsPerMonth: 2000, // matches subscription_plans seed
      packingOptimizations: 2000,
      routeOptimizations: 500,
      storageGB: 20,
      apiCallsPerMonth: 50000,
      smsOtpPerMonth: 2000,
      supportLevel: 'priority',
    },
    targetAudience: 'Mid-size logistics firms, regional transporters',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 0, // Contact us: no list price (quote only)
    yearlyPrice: 0, // Contact us: no list price (quote only)
    features: [
      'Everything in Professional +',
      'Unlimited Users',
      'Unlimited Trucks',
      'White-label Solution',
      'On-premise Deployment Option',
      'Custom Algorithm Development',
      'ERP/TMS Integration',
      'Dedicated Account Manager',
      '24/7 Phone Support',
      'SLA Guarantee (99.9% uptime)',
      'Custom Reports & BI',
      'Training & Onboarding',
      'Compliance Certifications',
    ],
    limits: {
      users: -1, // Unlimited
      trucksManaged: -1,
      shipmentsPerMonth: -1,
      packingOptimizations: -1,
      routeOptimizations: -1,
      storageGB: 100,
      apiCallsPerMonth: -1,
      smsOtpPerMonth: 10000,
      supportLevel: 'dedicated',
    },
    targetAudience: 'Large logistics companies, 3PL providers, enterprise fleet operators',
  },
]

// ============= ADD-ONS (Pay-as-you-go) =============
export const ADD_ONS = {
  extraSmsOtp: {
    name: 'Extra SMS OTP Pack',
    price: 99, // ₹99 for 500 SMS (cost ₹125, but bulk discount)
    quantity: 500,
    unit: 'SMS',
  },
  extraStorage: {
    name: 'Extra Storage',
    price: 49, // ₹49 per GB/month
    quantity: 1,
    unit: 'GB/month',
  },
  extraUsers: {
    name: 'Additional User',
    price: 199, // ₹199 per user/month
    quantity: 1,
    unit: 'user/month',
  },
  extraApiCalls: {
    name: 'API Call Pack',
    price: 499, // ₹499 for 10,000 API calls
    quantity: 10000,
    unit: 'API calls',
  },
  whatsappNotifications: {
    name: 'WhatsApp Notifications',
    price: 299, // ₹299 for 1000 messages
    quantity: 1000,
    unit: 'messages',
  },
  advancedAnalytics: {
    name: 'Advanced Analytics',
    price: 999, // ₹999/month add-on
    quantity: 1,
    unit: 'month',
  },
  dedicatedSupport: {
    name: 'Dedicated Support Hours',
    price: 1999, // ₹1999 for 5 hours
    quantity: 5,
    unit: 'hours',
  },
}

// ============= REVENUE PROJECTIONS =============
export const REVENUE_PROJECTIONS = {
  year1: {
    starterCustomers: 500,
    growthCustomers: 200,
    professionalCustomers: 50,
    enterpriseCustomers: 10,
    monthlyRecurringRevenue:
      500 * 499 + 200 * 1999 + 50 * 4999 + 10 * 14999, // ₹9,49,390
    annualRecurringRevenue: 9_49_390 * 12, // ₹1.14 Cr
  },
  year2: {
    starterCustomers: 1000,
    growthCustomers: 500,
    professionalCustomers: 150,
    enterpriseCustomers: 30,
    monthlyRecurringRevenue:
      1000 * 499 + 500 * 1999 + 150 * 4999 + 30 * 14999, // ₹25,48,320
    annualRecurringRevenue: 25_48_320 * 12, // ₹3.06 Cr
  },
  year3: {
    starterCustomers: 2000,
    growthCustomers: 1200,
    professionalCustomers: 400,
    enterpriseCustomers: 80,
    monthlyRecurringRevenue:
      2000 * 499 + 1200 * 1999 + 400 * 4999 + 80 * 14999, // ₹65,96,720
    annualRecurringRevenue: 65_96_720 * 12, // ₹7.92 Cr
  },
}

// ============= COMPETITIVE ANALYSIS =============
export const COMPETITIVE_PRICING = {
  // Comparison with Indian logistics SaaS
  competitors: [
    { name: 'Locus', segment: 'Enterprise', priceRange: '₹50,000-₹5,00,000/month' },
    { name: 'FarEye', segment: 'Enterprise', priceRange: '₹30,000-₹3,00,000/month' },
    { name: 'LogiNext', segment: 'Mid-Large', priceRange: '₹20,000-₹2,00,000/month' },
    { name: 'Shipsy', segment: 'SMB-Mid', priceRange: '₹5,000-₹50,000/month' },
    { name: 'TruckOpti', segment: 'SMB-Enterprise', priceRange: '₹499/month and up, excl. GST; Enterprise by quote' },
  ],
  uniqueSellingPoints: [
    '3D Bin Packing AI - Unique feature not offered by competitors',
    'Indian truck catalogue with standard truck sizes',
    'Affordable Entry Point - ₹499/month vs ₹5,000+ competitors',
    'Offline-capable PWA - installable web app experience',
  ],
}

// ============= DISCOUNT STRATEGIES =============
export const DISCOUNTS = {
  annual: {
    percentage: 16.7, // 10 x monthly = two months free
    description: 'Pay yearly, two months free',
  },
  referral: {
    referrerCredit: 500, // ₹500 credit
    refereeDiscount: 20, // 20% off first month
    description: 'Refer & Earn',
  },
  startup: {
    percentage: 30,
    eligibility: 'DPIIT registered startups',
    description: '30% off for registered startups',
  },
  ngo: {
    percentage: 40,
    eligibility: 'Registered NGOs',
    description: '40% off for NGOs',
  },
  educational: {
    percentage: 50,
    eligibility: 'Educational institutions',
    description: '50% off for educational use',
  },
}

// ============= FREE TRIAL =============
// Only transport agencies get the trial, started by the agency owner. No card, no free-forever tier.
export const TRIAL_CONFIG = {
  freeTrial: {
    duration: 14, // days
    tier: 'starter', // The trial has Starter limits
    creditCardRequired: false,
    features: 'Starter limits for 14 days',
  },
}

// ============= HUMAN LABELS FOR DATABASE FEATURE SLUGS =============
// subscription_plans.features holds machine slugs (see the seed migrations).
// Every known slug is mapped here; unknown slugs fall back to a title-cased label.
export const FEATURE_LABELS: Readonly<Record<string, string>> = {
  basic_3d_packing: '3D bin packing',
  advanced_3d_packing: 'Advanced 3D packing',
  route_planning: 'Route planning',
  multi_stop_optimization: 'Multi-stop route optimisation',
  shipment_tracking: 'Shipment tracking',
  live_tracking: 'Live GPS tracking',
  basic_reports: 'Basic reports',
  analytics_dashboard: 'Analytics dashboard',
  advanced_analytics: 'Advanced analytics',
  export_reports: 'Report export',
  api_access: 'API access',
  enterprise_algorithms: 'Enterprise packing algorithms',
  fleet_management: 'Fleet management',
  custom_branding: 'Custom branding',
  webhook_integrations: 'Webhook integrations',
  sla_guarantee: 'SLA guarantee',
  unlimited_everything: 'Unlimited usage',
  white_label: 'White-label',
  custom_integrations: 'Custom integrations',
  dedicated_support: 'Dedicated support',
  on_premise_option: 'On-premise option',
  custom_sla: 'Custom SLA',
}

/** Human label for a feature slug. Unknown slugs are title-cased with underscores and dashes removed. */
export function featureLabel(slug: string): string {
  const key = slug.trim()
  if (Object.prototype.hasOwnProperty.call(FEATURE_LABELS, key)) return FEATURE_LABELS[key]
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ============= HUMAN LABELS FOR SUPPORT LEVELS =============
export const SUPPORT_LEVEL_LABELS: Readonly<Record<string, string>> = {
  community: 'Community support',
  email: 'Email support',
  chat: 'Chat support',
  priority: 'Priority support',
  dedicated: 'Dedicated account manager',
}

export function supportLevelLabel(level: string): string {
  return SUPPORT_LEVEL_LABELS[level] ?? featureLabel(level)
}

export default PRICING_TIERS
