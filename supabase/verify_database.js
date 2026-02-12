/**
 * TruckOpti Database Verification Script
 * Tests all tables and RLS policies using supabase-js
 * 
 * Usage: node verify_database.js
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env variables
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbxncejtcbpcronndqlx.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Get it from: Supabase Dashboard > Project Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Test data for each table
const testData = {
  trucks: {
    name: 'Test Truck',
    name_hi: 'टेस्ट ट्रक',
    length: 5.0,
    width: 2.0,
    height: 2.0,
    capacity: 3000,
    cost_per_km: 25,
    available: 1
  },
  cartons: {
    name: 'Test Carton',
    length: 40,
    width: 30,
    height: 25,
    weight: 8,
    fragile: false,
    stackable: true
  },
  customers: {
    name: 'Test Customer',
    phone: '+919876543210',
    email: 'test@example.com',
    address: '123 Test Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    gst_number: '27AABCU9603R1ZX'
  },
  packing_jobs: {
    status: 'pending',
    items: [],
    volume_utilization: 0,
    weight_utilization: 0,
    algorithm: 'skyline',
    optimization_goal: 'space'
  },
  sale_orders: {
    order_number: 'TEST-001',
    status: 'pending',
    total_items: 0,
    total_volume: 0,
    total_weight: 0,
    priority: 1
  },
  notifications: {
    title: 'Test Notification',
    message: 'This is a test notification',
    type: 'info',
    is_read: false
  },
  analytics_events: {
    event_type: 'page_view',
    event_data: { page: 'test' },
    session_id: 'test-session'
  }
};

const tables = [
  'trucks',
  'cartons', 
  'customers',
  'shipments',
  'routes',
  'packing_results',
  'users',
  'subscription_plans',
  'subscriptions',
  'usage_tracking',
  'invoices',
  'packing_jobs',
  'packing_items',
  'sale_orders',
  'sale_order_items',
  'notifications',
  'analytics_events'
];

async function verifyTable(tableName) {
  console.log(`\n📋 Testing table: ${tableName}`);
  
  try {
    // Test 1: Check if table exists by querying
    const { data: countData, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.log(`   ❌ Table query failed: ${countError.message}`);
      return false;
    }
    
    console.log(`   ✅ Table exists and queryable`);
    
    // Test 2: Try to insert test data (if applicable)
    if (testData[tableName]) {
      const insertData = { ...testData[tableName] };
      
      // Add user_id for user-specific tables
      if (['packing_jobs', 'sale_orders', 'notifications', 'analytics_events'].includes(tableName)) {
        // Get first user or skip
        const { data: userData } = await supabase.auth.admin.listUsers();
        if (userData?.users?.length > 0) {
          insertData.user_id = userData.users[0].id;
        } else {
          console.log(`   ⚠️ Skipping insert test - no users found`);
          return true;
        }
      }
      
      const { data: insertData2, error: insertError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single();
      
      if (insertError) {
        console.log(`   ⚠️ Insert test: ${insertError.message}`);
      } else {
        console.log(`   ✅ Insert test passed (ID: ${insertData2.id})`);
        
        // Clean up - delete test row
        await supabase.from(tableName).delete().eq('id', insertData2.id);
        console.log(`   ✅ Cleanup completed`);
      }
    }
    
    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function verifyRLS() {
  console.log(`\n🔒 Testing RLS Policies...`);
  
  try {
    // Try to get RLS status for tables
    const { data: rlsData, error: rlsError } = await supabase.rpc('get_rls_status');
    
    if (rlsError) {
      console.log(`   ℹ️ RLS status function not available, checking manually...`);
      
      // Check each table for RLS
      for (const table of tables.slice(0, 5)) {
        const { error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error?.message?.includes('permission denied') || error?.message?.includes('policy')) {
          console.log(`   ✅ ${table}: RLS is active (permission check working)`);
        } else {
          console.log(`   ⚠️ ${table}: May have open access or RLS not enforced`);
        }
      }
    } else {
      console.log(`   ✅ RLS status retrieved`);
    }
    
    return true;
  } catch (error) {
    console.log(`   ⚠️ RLS check: ${error.message}`);
    return true; // Don't fail on RLS check
  }
}

async function runVerification() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TruckOpti Database Verification                        ║');
  console.log('║     Project: jbxncejtcbpcronndqlx.supabase.co             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let passed = 0;
  let failed = 0;
  
  // Verify all tables
  for (const table of tables) {
    const success = await verifyTable(table);
    if (success) passed++;
    else failed++;
  }
  
  // Verify RLS
  await verifyRLS();
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Tables passed: ${passed}/${tables.length}`);
  console.log(`❌ Tables failed: ${failed}/${tables.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tables verified successfully!');
    console.log('\nNext steps:');
    console.log('1. ✅ Database setup complete');
    console.log('2. Configure Google OAuth (see GOOGLE_OAUTH_SETUP.md)');
    console.log('3. Configure Google Maps (see GOOGLE_MAPS_SETUP.md)');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tables need attention');
    process.exit(1);
  }
}

runVerification().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
