import { describe, it, expect, vi } from 'vitest';
import { subscriptionHelpers } from './subscriptionApi';

// Mock Supabase to avoid environment variable requirements
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('subscriptionHelpers.getUsagePercentage', () => {
  it('should return 0 when limit is 0 (zero limit)', () => {
    expect(subscriptionHelpers.getUsagePercentage(0, 0)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(5, 0)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(100, 0)).toBe(0);
  });

  it('should return 0 when limit is -1 (unlimited)', () => {
    expect(subscriptionHelpers.getUsagePercentage(0, -1)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(50, -1)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(1000, -1)).toBe(0);
  });

  it('should return 0 for non-positive finite limits', () => {
    expect(subscriptionHelpers.getUsagePercentage(0, -10)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(5, -5)).toBe(0);
  });

  it('should calculate percentage correctly for normal positive limits', () => {
    // Exact percentages
    expect(subscriptionHelpers.getUsagePercentage(0, 100)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(25, 100)).toBe(25);
    expect(subscriptionHelpers.getUsagePercentage(50, 100)).toBe(50);
    expect(subscriptionHelpers.getUsagePercentage(75, 100)).toBe(75);
    expect(subscriptionHelpers.getUsagePercentage(100, 100)).toBe(100);

    // Different limits
    expect(subscriptionHelpers.getUsagePercentage(5, 10)).toBe(50);
    expect(subscriptionHelpers.getUsagePercentage(1, 3)).toBe(33); // 1/3 ≈ 33.33%, rounds to 33
    expect(subscriptionHelpers.getUsagePercentage(2, 3)).toBe(67); // 2/3 ≈ 66.67%, rounds to 67
  });

  it('should cap at 100 when usage exceeds limit', () => {
    expect(subscriptionHelpers.getUsagePercentage(150, 100)).toBe(100);
    expect(subscriptionHelpers.getUsagePercentage(200, 100)).toBe(100);
    expect(subscriptionHelpers.getUsagePercentage(1000, 10)).toBe(100);
  });

  it('should handle zero used with positive limits', () => {
    expect(subscriptionHelpers.getUsagePercentage(0, 10)).toBe(0);
    expect(subscriptionHelpers.getUsagePercentage(0, 1000)).toBe(0);
  });
});
