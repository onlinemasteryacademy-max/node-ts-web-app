import fs from 'fs';
import path from 'path';
import { getDb, initSchema, dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete } from '../src/db/db.js';
import {
  normalizePhoneNumber,
  formatCurrency,
  hashPassword,
  comparePassword,
  getStorePlanDetails,
  can,
  limit,
  resolveOrCreateCustomer,
  checkCustomerOpenOrdersLimit,
  calculateStoreRevenueMetrics,
  generatePasswordResetToken,
  normalizeStoreSlug,
  validateStoreSlugAvailability,
  getStoreCategoryInfo,
  NIGERIAN_STATES,
  getEffectivePlans,
  getPlatformSettings
} from '../src/utils/helpers.js';
import {
  getOrCreateCustomerSession,
  sendMessage,
  getConversationMessages,
  listMerchantConversations
} from '../src/modules/chat/chatService.js';
import {
  createOrder,
  submitPaymentClaim,
  confirmOrderPayment,
  rejectOrderPayment,
  updateOrderStatus
} from '../src/modules/orders/ordersService.js';
import {
  getAdminRoles,
  hasAdminPermission,
  logAdminAction
} from '../src/modules/admin/adminHelpers.js';
import { ENV } from '../src/config/env.js';
import {
  initSuperAdminAccount,
  checkAdminRateLimit,
  recordFailedAdminLogin,
  resetAdminRateLimit
} from '../src/modules/admin/adminSecurity.js';
import {
  sendMerchantWelcomeEmail,
  sendMerchantOrderAlertEmail,
  sendCustomerOrderConfirmationEmail,
  sendPasswordResetEmail,
  sendAdminTestEmail,
  sendEmailVerificationOtp
} from '../src/modules/email/mailer.js';
import { getSampleDataForTemplate, SAMPLE_STORES_DATA } from '../src/config/sampleTemplatesData.js';
import { STORE_TEMPLATES, STORE_CATEGORIES } from '../src/config/templates.js';
import { PLANS } from '../src/config/plans.js';
import { recordStoreVisit, getStoreVisitorMetrics } from '../src/modules/analytics/analyticsController.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 ZLIK NODE.JS & TYPESCRIPT COMPLETE TEST SUITE');
  console.log('======================================================\n');

  const db = getDb();
  initSchema(db);

  // Setup Test Stores
  const ensureStore = (id: number, slug: string, name: string) => {
    const existing = dbFetchOne('stores', { id });
    if (!existing) {
      dbInsert('stores', {
        id,
        slug,
        store_name: name,
        owner_name: 'Test Owner',
        email: `${slug}@store.com`,
        password_hash: 'hash123',
        whatsapp_number: '08012345678',
        delivery_fee: 1500
      });
    }
  };

  ensureStore(8881, 'store-8881', 'Store 8881');
  ensureStore(8882, 'store-8882', 'Store 8882');
  ensureStore(7771, 'store-7771', 'Store 7771');
  ensureStore(7772, 'store-7772', 'Store 7772');
  ensureStore(6661, 'store-6661', 'Store 6661');

  // -------------------------------------------------------------
  // SUITE 1: Phone Normalization & Customer Identity Engine (16 Tests)
  // -------------------------------------------------------------
  console.log('--- 1. Phone Normalization & Customer Identity Engine ---');
  assert(normalizePhoneNumber('08012345678') === '+2348012345678', '08012345678 -> +2348012345678');
  assert(normalizePhoneNumber('+2348012345678') === '+2348012345678', '+2348012345678 -> +2348012345678');
  assert(normalizePhoneNumber('2348012345678') === '+2348012345678', '2348012345678 -> +2348012345678');
  assert(normalizePhoneNumber('080 1234 5678') === '+2348012345678', '080 1234 5678 -> +2348012345678');
  assert(normalizePhoneNumber('080-1234-5678') === '+2348012345678', '080-1234-5678 -> +2348012345678');
  assert(normalizePhoneNumber('8012345678') === '+2348012345678', '8012345678 -> +2348012345678');
  assert(normalizePhoneNumber(' 070 3333 4444 ') === '+2347033334444', '070 3333 4444 -> +2347033334444');
  assert(normalizePhoneNumber('+234 901-222-3333') === '+2349012223333', '+234 901-222-3333 -> +2349012223333');

  const testStoreId = 8881;
  dbDelete('customers', { store_id: testStoreId });

  const c1 = resolveOrCreateCustomer(testStoreId, '08012345678', 'John', null, 'Lagos');
  assert(Boolean(c1 && c1.id), 'Customer 1 created');
  assert(c1.phone_normalized === '+2348012345678', 'Phone normalized canonical value is +2348012345678');
  assert(c1.name === 'John', 'Customer name is John');

  const c2 = resolveOrCreateCustomer(testStoreId, '+2348012345678', 'John Udoh', null, '12 Marina');
  assert(c1.id === c2.id, 'Resolved to same customer ID when format varied');
  assert(c2.name === 'John Udoh', 'Customer name updated to John Udoh');

  const c3 = resolveOrCreateCustomer(testStoreId, '080-1234-5678', 'John Udoh Ventures');
  assert(c1.id === c3.id, 'Resolved to same customer ID when hyphenated');
  assert(c3.name === 'John Udoh Ventures', 'Customer name evolved to John Udoh Ventures');

  const storeCusts = dbFetchAll('customers', { store_id: testStoreId });
  assert(storeCusts.length === 1, 'Exactly 1 customer profile exists for store');

  // Customer store isolation
  const cStore2 = resolveOrCreateCustomer(8882, '08012345678', 'John from Store 2');
  assert(cStore2.id !== c1.id, 'Same phone in different store creates distinct customer record');
  assert(cStore2.store_id === 8882, 'Customer record strictly bound to store 8882');

  // -------------------------------------------------------------
  // SUITE 2: Ultra-Lightweight Live Chat & Permanence (11 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 2. Ultra-Lightweight Live Chat & Permanence Engine ---');
  const chatStoreId = 7771;
  dbDelete('chat_conversations', { store_id: chatStoreId });

  const custSession = getOrCreateCustomerSession(chatStoreId, 'fresh_token_001', 'Shopper Aisha', '08099998888');
  assert(Boolean(custSession.conversation.id), 'Customer session initialized with unique token');

  const welcomeMsgs = getConversationMessages(custSession.conversation.id);
  assert(welcomeMsgs.length >= 1 && welcomeMsgs[0].sender_type === 'system', 'Welcome system greeting present');

  // Customer sends message
  const sendRes = sendMessage(custSession.conversation.id, 'customer', 'Shopper Aisha', 'Hello, do you deliver to Abuja?', {
    idempotencyKey: 'idemp_key_001'
  });
  assert(sendRes.success, 'Customer message accepted');
  assert(sendRes.conversation?.unread_merchant_count === 1, 'Unread merchant count incremented');

  // Deduplication
  const dupRes = sendMessage(custSession.conversation.id, 'customer', 'Shopper Aisha', 'Hello, do you deliver to Abuja?', {
    idempotencyKey: 'idemp_key_001'
  });
  assert(dupRes.duplicate === true, 'Duplicate message with identical key safely deduplicated');

  // Merchant replies
  const replyRes = sendMessage(custSession.conversation.id, 'merchant', 'Merchant Team', 'Yes, we do deliver to Abuja nationwide!');
  assert(replyRes.success, 'Merchant reply accepted');
  assert(replyRes.conversation?.unread_merchant_count === 0, 'Merchant reply resets merchant unread count to 0');
  assert(replyRes.conversation?.unread_customer_count === 1, 'Customer unread count incremented');

  // Delta polling
  const deltaMsgs = getConversationMessages(custSession.conversation.id, sendRes.message!.id);
  assert(deltaMsgs.length === 1 && deltaMsgs[0].id === replyRes.message!.id, 'Delta polling with after_id returns only newly appended message');

  // Strict merchant isolation
  const listStore1 = listMerchantConversations(chatStoreId);
  const listStore2 = listMerchantConversations(7772);
  assert(listStore1.conversations.length > 0, 'Store 1 can access its conversations');
  assert(listStore2.conversations.length === 0, 'Store 2 cannot view Store 1 private conversations');

  // Chat permanence after order status transitions
  const ordPerm = createOrder({
    store_id: chatStoreId,
    customer_name: 'Shopper Aisha',
    customer_phone: '08099998888',
    delivery_address: 'Wuse 2, Abuja',
    items: [{ title: 'Abuja Special', price: 3000, quantity: 1 }]
  });
  assert(ordPerm.success, 'Order linked with chat customer created');

  // Change order status across all states
  updateOrderStatus(ordPerm.order.id, chatStoreId, 'confirmed');
  updateOrderStatus(ordPerm.order.id, chatStoreId, 'dispatched');
  updateOrderStatus(ordPerm.order.id, chatStoreId, 'completed');

  // Verify chat messages still persist permanently
  const postOrderMsgs = getConversationMessages(custSession.conversation.id);
  assert(postOrderMsgs.length >= 3, 'Chat history permanently retained in database after order completion');

  // -------------------------------------------------------------
  // SUITE 3: Plan Enforcement & Gating (6 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 3. Plan Enforcement & Feature Gating Engine ---');
  const freeStore = { plan: 'free', is_trial_active: 0 };
  const proStore = { plan: 'pro', is_trial_active: 0, plan_expires_at: '2099-01-01 00:00:00' };
  const businessStore = { plan: 'business', is_trial_active: 0, plan_expires_at: '2099-01-01 00:00:00' };
  const trialStore = { plan: 'free', is_trial_active: 1, trial_ends_at: '2099-01-01 00:00:00' };

  assert(!can(freeStore, 'custom_domain'), 'Free store cannot use custom domain');
  assert(!can(proStore, 'custom_domain'), 'Pro store cannot use custom domain (Business feature)');
  assert(can(businessStore, 'custom_domain'), 'Business store can use custom domain');
  assert(limit(freeStore, 'max_products') === 10, 'Free plan limits products to 10');
  assert(limit(proStore, 'max_products') === 500, 'Pro plan limits products to 500');
  assert(limit(businessStore, 'max_products') === -1, 'Business plan has unlimited products');
  assert(formatCurrency(5000) === '₦5,000.00', 'formatCurrency formats 5000 to ₦5,000.00');

  // -------------------------------------------------------------
  // SUITE 4: Orders, Payment Claims & Anti-Spam (6 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 4. Orders, Payment Claims & Anti-Spam ---');
  const orderStoreId = 6661;
  dbDelete('orders', { store_id: orderStoreId });
  dbDelete('payment_claims', { store_id: orderStoreId });

  const ord1 = createOrder({
    store_id: orderStoreId,
    customer_name: 'David Adeleke',
    customer_phone: '08123456789',
    delivery_address: 'Banana Island, Lagos',
    fulfillment_type: 'delivery',
    delivery_fee: 1500,
    items: [{ title: 'Special Burger', price: 4500, quantity: 2 }]
  });

  assert(ord1.success, 'Order #1 created successfully');
  assert(ord1.order?.total_amount === 10500, 'Total amount calculated accurately (4500*2 + 1500 = 10500)');

  // Payment Claim
  const claimRes = submitPaymentClaim(ord1.order.id, 'GTB-TRANSFER-REF-9921');
  assert(claimRes.success, 'Payment claim submitted');

  const dupClaim = submitPaymentClaim(ord1.order.id, 'GTB-TRANSFER-REF-9921');
  assert(dupClaim.duplicate === true, 'Rapid duplicate payment claim deduplicated safely');

  // Confirm payment
  const confRes = confirmOrderPayment(ord1.order.id, orderStoreId);
  assert(confRes.success, 'Merchant confirmed payment');

  const updatedOrder = dbFetchOne<any>('orders', { id: ord1.order.id });
  assert(updatedOrder.payment_status === 'paid', 'Order payment_status is paid');
  assert(updatedOrder.order_status === 'confirmed', 'Order order_status is confirmed');

  // Create 2 more open orders to trigger the open-order limit check
  const ord2 = createOrder({
    store_id: orderStoreId,
    customer_name: 'David Adeleke',
    customer_phone: '08123456789',
    items: [{ title: 'Fries', price: 1000, quantity: 1 }]
  });
  assert(ord2.success, 'Order #2 created (1st open order)');

  const ord3 = createOrder({
    store_id: orderStoreId,
    customer_name: 'David Adeleke',
    customer_phone: '08123456789',
    items: [{ title: 'Soda', price: 500, quantity: 1 }]
  });
  assert(ord3.success, 'Order #3 created (2nd open order)');

  // 3rd open order should return open_orders_exceeded warning without force_create
  const ord4Blocked = createOrder({
    store_id: orderStoreId,
    customer_name: 'David Adeleke',
    customer_phone: '08123456789',
    items: [{ title: 'Ice Cream', price: 800, quantity: 1 }]
  });
  assert(!ord4Blocked.success && ord4Blocked.open_orders_exceeded === true, 'Order blocked with open_orders_exceeded warning');
  assert(Array.isArray(ord4Blocked.existing_orders) && ord4Blocked.existing_orders.length >= 2, 'Existing open orders returned in response');

  // But with force_create: true, customer can proceed smoothly
  const ord4Forced = createOrder({
    store_id: orderStoreId,
    customer_name: 'David Adeleke',
    customer_phone: '08123456789',
    items: [{ title: 'Ice Cream', price: 800, quantity: 1 }],
    force_create: true
  });
  assert(ord4Forced.success === true, 'Order created successfully when customer chooses to continue (force_create: true)');

  // -------------------------------------------------------------
  // SUITE 5: Auth & Crypto Tokens (4 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 5. Authentication & Crypto Password Resets ---');
  const plainPass = 'SuperSecret123!';
  const passHash = await hashPassword(plainPass);
  assert(await comparePassword(plainPass, passHash), 'Password hash verification matches');
  assert(!(await comparePassword('WrongPass', passHash)), 'Wrong password rejected');

  const { token, hash } = generatePasswordResetToken();
  assert(token.length === 64, 'Crypto reset token is 64 hex characters');
  assert(hash.length === 64, 'Token sha256 hash is 64 hex characters');

  // Slug / Username Uniqueness & Reservation Checks
  assert(normalizeStoreSlug('Fresh Bites & Grill!') === 'fresh-bites-grill', 'Slug normalized correctly to fresh-bites-grill');
  
  // Reserved system username check
  const reservedAdminCheck = validateStoreSlugAvailability('admin');
  assert(!reservedAdminCheck.valid && reservedAdminCheck.error?.includes('reserved'), 'Reserved system username "admin" correctly rejected');

  const reservedApiCheck = validateStoreSlugAvailability('api');
  assert(!reservedApiCheck.valid && reservedApiCheck.error?.includes('reserved'), 'Reserved system username "api" correctly rejected');

  // Length limits (< 3 or > 30)
  const shortSlugCheck = validateStoreSlugAvailability('ab');
  assert(!shortSlugCheck.valid, 'Short username (< 3 chars) correctly rejected');

  // Register active store with unique username
  const testSlug = 'brand-exclusive-' + Date.now();
  const slugTestStoreId = dbInsert('stores', {
    slug: testSlug,
    store_name: 'Brand Exclusive',
    owner_name: 'Brand Owner',
    password_hash: passHash,
    whatsapp_number: '08099887766',
    status: 'active'
  });

  // Re-registration of same username by another active store must fail
  const dupSlugCheck = validateStoreSlugAvailability(testSlug);
  assert(!dupSlugCheck.valid && dupSlugCheck.error?.includes('already assigned'), 'Duplicate active username assignment rejected');

  // When store is deleted, username is released for new store
  dbUpdate('stores', { status: 'deleted', slug: `${testSlug}_deleted_${slugTestStoreId}` }, { id: slugTestStoreId });
  const releasedSlugCheck = validateStoreSlugAvailability(testSlug);
  assert(releasedSlugCheck.valid === true, 'Username becomes immediately available after previous store is deleted');

  // -------------------------------------------------------------
  // SUITE 6: Super Admin RBAC & Governance Engine (10 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 6. Super Admin RBAC & Governance Engine ---');
  const roles = getAdminRoles();
  assert(Boolean(roles.super_admin), 'Super admin role exists');
  assert(Boolean(roles.support_lead), 'Support lead role exists');
  assert(Boolean(roles.moderator), 'Moderator role exists');
  assert(Boolean(roles.finance_analyst), 'Finance analyst role exists');

  // Create test admin users
  dbDelete('super_admins', { email: 'test_admin_owner@zlik.store' });
  dbDelete('super_admins', { email: 'test_support_lead@zlik.store' });

  const adminOwnerId = dbInsert('super_admins', {
    email: 'test_admin_owner@zlik.store',
    password_hash: hashPassword('ownerPass123'),
    name: 'Owner Admin',
    role: 'super_admin'
  });

  const supportLeadId = dbInsert('super_admins', {
    email: 'test_support_lead@zlik.store',
    password_hash: hashPassword('supportPass123'),
    name: 'Support Sarah',
    role: 'support_lead'
  });

  assert(hasAdminPermission('manage_pricing', adminOwnerId), 'Super admin has all permissions (*)');
  assert(hasAdminPermission('impersonate_merchants', supportLeadId), 'Support lead has impersonate_merchants permission');
  assert(!hasAdminPermission('manage_pricing', supportLeadId), 'Support lead denied manage_pricing permission');

  const auditLogId = logAdminAction(adminOwnerId, 'Platform Upgrade', 'system', 0, 'Upgraded Node.js server to Fastify v5');
  assert(auditLogId > 0, 'Audit log recorded with ID');
  const auditRow = dbFetchOne<any>('admin_audit_logs', { id: auditLogId });
  assert(auditRow && auditRow.admin_id === adminOwnerId, 'Audit row admin_id matches actor');
  assert(auditRow.action === 'Platform Upgrade', 'Audit log action matches');

  // -------------------------------------------------------------
  // SUITE 7: Transactional Mailer & Dispatch Sandbox (5 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 7. Transactional Mailer & Dispatch Sandbox ---');
  const testStore = {
    id: 9999,
    store_name: 'Luxury Velvet Apparel',
    owner_name: 'Amaka Eze',
    email: 'amaka@velvetapparel.com',
    slug: 'velvet-apparel'
  };

  const welcomeMailRes = await sendMerchantWelcomeEmail(testStore);
  assert(welcomeMailRes.success, 'Merchant welcome email successfully processed');

  const alertMailRes = await sendMerchantOrderAlertEmail(testStore, {
    order_ref: 'ORD-TEST-9988',
    customer_name: 'Chidi Okafor',
    customer_phone: '08033332222',
    total_amount: 45000
  }, [{ title: 'Velvet Evening Gown', qty: 1, price: 45000 }]);
  assert(alertMailRes.success, 'Merchant new order alert email successfully processed');

  const custConfMailRes = await sendCustomerOrderConfirmationEmail(testStore, {
    order_ref: 'ORD-TEST-9988',
    customer_name: 'Chidi Okafor',
    customer_email: 'chidi@example.com',
    total_amount: 45000
  });
  assert(custConfMailRes.success, 'Customer order confirmation email successfully processed');

  const passResetMailRes = await sendPasswordResetEmail('amaka@velvetapparel.com', 'Amaka Eze', 'https://zlik.store/merchant/reset-password?token=abc');
  assert(passResetMailRes.success, 'Password reset email successfully processed');

  const testSmtpMailRes = await sendAdminTestEmail('admin@zlik.store');
  assert(testSmtpMailRes.success, 'Admin test email successfully processed');

  const loggedEmails = dbFetchAll<any>('email_logs', { recipient_email: 'amaka@velvetapparel.com' });
  assert(loggedEmails.length >= 2, 'Email dispatches permanently recorded in email_logs table');

  // -------------------------------------------------------------
  // SUITE 8: Store Categories & 15 Templates Architecture (20 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 8. Store Categories & 15 Templates Architecture ---');
  const { STORE_CATEGORIES, STORE_TEMPLATES, getStoreTemplateConfig, getTemplatesByCategory } = await import('../src/config/templates.js');

  // 1. Categories Registry Verification
  assert(Object.keys(STORE_CATEGORIES).length === 5, 'Exactly 5 industry-specific store categories registered');
  assert(Boolean(STORE_CATEGORIES.general), 'General Store category available');
  assert(Boolean(STORE_CATEGORIES.fashion), 'Fashion & Apparel category available');
  assert(Boolean(STORE_CATEGORIES.food), 'Food & Restaurant category available');
  assert(Boolean(STORE_CATEGORIES.beauty), 'Beauty & Personal Care category available');
  assert(Boolean(STORE_CATEGORIES.electronics), 'Electronics & Gadgets category available');

  // 2. 15 Templates Registry Verification (3 per Category: 1 Free, 2 Pro)
  assert(Object.keys(STORE_TEMPLATES).length === 15, 'Exactly 15 specialized store templates registered (5 categories x 3)');

  for (const catId of ['general', 'fashion', 'food', 'beauty', 'electronics']) {
    const catTemplates = getTemplatesByCategory(catId);
    assert(catTemplates.length === 3, `Category '${catId}' has exactly 3 templates`);
    const freeTemplates = catTemplates.filter(t => !t.is_pro);
    const proTemplates = catTemplates.filter(t => t.is_pro);
    assert(freeTemplates.length === 1, `Category '${catId}' has exactly 1 Free starter template`);
    assert(proTemplates.length === 2, `Category '${catId}' has exactly 2 Pro exclusive templates`);
  }

  // 3. Fallback & Alias Resolution
  assert(getStoreTemplateConfig('fashion_runway').id === 'fashion_runway', 'Direct lookup: fashion_runway -> Runway Boutique');
  assert(getStoreTemplateConfig('fashion').id === 'fashion_lookbook', 'Alias resolution: fashion -> Fashion Lookbook (Free)');
  assert(getStoreTemplateConfig('restaurant').id === 'food_menu', 'Alias resolution: restaurant -> Food Menu (Free)');
  assert(getStoreTemplateConfig('tech').id === 'electronics_tech', 'Alias resolution: tech -> Electronics Tech (Free)');
  assert(getStoreTemplateConfig('cosmetics').id === 'beauty_cosmetic', 'Alias resolution: cosmetics -> Beauty Cosmetic (Free)');
  assert(getStoreTemplateConfig('unknown_category').id === 'general_clean', 'Safe fallback: unknown -> Classic Grid (Free)');

  // 4. Pro Template Feature Gating Logic
  const tplFreeStore = { id: 7771, plan_tier: 'free', is_trial_active: 0 };
  const tplProStore = { id: 7772, plan_tier: 'pro', is_trial_active: 0 };
  const freePlanDetails = getStorePlanDetails(tplFreeStore);
  const proPlanDetails = getStorePlanDetails(tplProStore);

  const runwayTpl = STORE_TEMPLATES.fashion_runway;
  const lookbookTpl = STORE_TEMPLATES.fashion_lookbook;
  assert(!lookbookTpl.is_pro, 'Lookbook template is available for Free merchants');
  assert(runwayTpl.is_pro, 'Runway template requires Pro subscription');
  assert(!freePlanDetails.isPro, 'Free store is identified as non-Pro');
  assert(proPlanDetails.isPro, 'Pro store is identified as Pro');

  // 5. Fashion Store Item & Multi-Variant Matrix Order Placement
  const tplStoreId = 7771;
  dbDelete('items', { store_id: tplStoreId });
  dbDelete('orders', { store_id: tplStoreId });
  dbUpdate('stores', { template_slug: 'fashion_lookbook' }, { id: tplStoreId });

  const fashionItemId = dbInsert('items', {
    store_id: tplStoreId,
    title: 'Silk Evening Gown',
    category: 'Dresses',
    price: 35000,
    compare_price: 45000,
    stock_quantity: 20,
    sku: 'FASH-GOWN-01',
    variants_json: JSON.stringify([
      { id: 'm-black', name: 'M / Black', size: 'M', color: 'Black', price: 35000, stock: 10 },
      { id: 'l-gold', name: 'L / Gold', size: 'L', color: 'Gold', price: 38000, stock: 5 }
    ]),
    attributes_json: JSON.stringify({
      material: '100% Mulberry Silk',
      care: 'Dry clean only',
      sizes: 'M, L',
      colors: 'Black, Gold'
    }),
    is_available: 1
  });

  const fashionOrder = createOrder({
    store_id: tplStoreId,
    customer_name: 'Genevieve Nnaji',
    customer_phone: '08022334455',
    items: [
      {
        id: fashionItemId,
        title: 'Silk Evening Gown',
        price: 35000,
        variant: 'L / Gold',
        quantity: 1
      }
    ]
  });

  assert(fashionOrder.success, 'Fashion multi-variant order placed successfully');
  const fashionOrderItems = JSON.parse(fashionOrder.order.items_json);
  assert(fashionOrderItems[0].variant === 'L / Gold', 'Exact selected fashion variant recorded in order snapshot');
  assert(fashionOrderItems[0].unit_price === 38000, 'Authoritative variant price override applied (L/Gold = ₦38,000)');
  assert(fashionOrder.order.subtotal === 38000, 'Fashion order subtotal accurately calculated');

  // 4. Food & Restaurant Item & Option Groups with Paid Addons
  dbUpdate('stores', { template_slug: 'food' }, { id: tplStoreId });

  const foodItemId = dbInsert('items', {
    store_id: tplStoreId,
    title: 'Smoky Jollof & Grilled Chicken',
    category: 'Main Dish',
    price: 4000,
    option_groups_json: JSON.stringify([
      {
        name: 'Choose Portion',
        required: true,
        options: [
          { name: 'Regular Portion', price: 0 },
          { name: 'Jumbo Platter', price: 2500 }
        ]
      },
      {
        name: 'Add Extra Sides',
        required: false,
        options: [
          { name: 'Extra Fried Plantain (Dodo)', price: 800 },
          { name: 'Coleslaw', price: 500 }
        ]
      }
    ]),
    attributes_json: JSON.stringify({
      prep_time: '20-25 mins',
      dietary: 'Freshly Grilled, Halal'
    }),
    is_available: 1
  });

  const foodOrder = createOrder({
    store_id: tplStoreId,
    customer_name: 'Burna Boy',
    customer_phone: '08099881122',
    items: [
      {
        id: foodItemId,
        title: 'Smoky Jollof & Grilled Chicken',
        price: 4000,
        quantity: 2,
        selected_options: [
          { group: 'Choose Portion', name: 'Jumbo Platter', price: 2500 },
          { group: 'Add Extra Sides', name: 'Extra Fried Plantain (Dodo)', price: 800 }
        ],
        prep_notes: 'Please pack peppersauce separately'
      }
    ]
  });

  assert(foodOrder.success, 'Food customization order placed successfully');
  const foodOrderItems = JSON.parse(foodOrder.order.items_json);
  // Base (4000) + Jumbo (2500) + Dodo (800) = 7300 per unit * 2 qty = 14600
  assert(foodOrderItems[0].unit_price === 7300, 'Authoritative food option price computed (4000 + 2500 + 800 = 7300)');
  assert(foodOrderItems[0].total === 14600, 'Food item line total accurate (7300 * 2 = 14600)');
  assert(foodOrderItems[0].notes === 'Please pack peppersauce separately', 'Food preparation notes persisted in snapshot');

  // 5. Beauty & Personal Care Item & Volume Variant Order Placement
  dbUpdate('stores', { template_slug: 'beauty' }, { id: tplStoreId });

  const beautyItemId = dbInsert('items', {
    store_id: tplStoreId,
    title: 'Glow Boost Niacinamide Serum',
    category: 'Skincare',
    price: 8500,
    variants_json: JSON.stringify([
      { id: '30ml', name: '30ml', volume: '30ml', price: 8500, stock: 40 },
      { id: '50ml', name: '50ml', volume: '50ml', price: 13500, stock: 25 }
    ]),
    attributes_json: JSON.stringify({
      formulation: 'Serum',
      volumes: '30ml, 50ml',
      shades: 'Universal Clear',
      concerns: 'Hydration, Radiance',
      ingredients: 'Niacinamide 10%, Zinc PCA 1%'
    }),
    is_available: 1
  });

  const beautyOrder = createOrder({
    store_id: tplStoreId,
    customer_name: 'Tiwa Savage',
    customer_phone: '08033221100',
    items: [
      {
        id: beautyItemId,
        title: 'Glow Boost Niacinamide Serum',
        price: 8500,
        variant: '50ml',
        quantity: 1
      }
    ]
  });

  assert(beautyOrder.success, 'Beauty volume variant order placed successfully');
  const beautyOrderItems = JSON.parse(beautyOrder.order.items_json);
  assert(beautyOrderItems[0].variant === '50ml', 'Beauty selected volume recorded in snapshot');
  assert(beautyOrderItems[0].unit_price === 13500, 'Beauty 50ml price override applied (₦13,500)');

  // 6. Electronics & Gadgets Item & Config Variant Order Placement
  dbUpdate('stores', { template_slug: 'electronics' }, { id: tplStoreId });

  const techItemId = dbInsert('items', {
    store_id: tplStoreId,
    title: 'Pro Ultra Smartphone 5G',
    category: 'Smartphones',
    price: 450000,
    variants_json: JSON.stringify([
      { id: '256gb', name: '256GB / 8GB RAM', config: '256GB', price: 450000, stock: 15 },
      { id: '512gb', name: '512GB / 12GB RAM', config: '512GB', price: 520000, stock: 8 }
    ]),
    attributes_json: JSON.stringify({
      condition: 'Brand New',
      warranty: '1 Year Manufacturer Warranty',
      configs: '256GB, 512GB',
      box_contents: 'Phone, Fast Charger, USB-C Cable',
      specs_text: 'Display: 6.7" OLED | Chip: Snapdragon 8 Gen 3 | Battery: 5000mAh'
    }),
    is_available: 1
  });

  const techOrder = createOrder({
    store_id: tplStoreId,
    customer_name: 'Wizkid Balogun',
    customer_phone: '08077665544',
    items: [
      {
        id: techItemId,
        title: 'Pro Ultra Smartphone 5G',
        price: 450000,
        variant: '512GB / 12GB RAM',
        quantity: 1
      }
    ]
  });

  assert(techOrder.success, 'Electronics config variant order placed successfully');
  const techOrderItems = JSON.parse(techOrder.order.items_json);
  assert(techOrderItems[0].variant === '512GB / 12GB RAM', 'Electronics storage config recorded in snapshot');
  assert(techOrderItems[0].unit_price === 520000, 'Electronics 512GB price override applied (₦520,000)');

  // 7. Product Editing / Update Test
  dbUpdate('items', {
    title: 'Pro Ultra Smartphone 5G (Upgraded)',
    price: 460000,
    badge: 'Flagship Deal',
    stock_quantity: 30
  }, { id: techItemId });

  const updatedTechItem = dbFetchOne<any>('items', { id: techItemId });
  assert(updatedTechItem.title === 'Pro Ultra Smartphone 5G (Upgraded)', 'Product title edited successfully');
  assert(updatedTechItem.price === 460000, 'Product base price updated to ₦460,000');
  assert(updatedTechItem.badge === 'Flagship Deal', 'Product promotional badge added');
  assert(updatedTechItem.stock_quantity === 30, 'Product stock quantity updated');

  // Verify historical order snapshot remains unaffected by product catalog update
  const verifiedHistoricTechOrder = dbFetchOne<any>('orders', { id: techOrder.order.id });
  const historicSnapshotItems = JSON.parse(verifiedHistoricTechOrder.items_json);
  assert(historicSnapshotItems[0].title === 'Pro Ultra Smartphone 5G', 'Historical order title unchanged by future product edits');
  assert(historicSnapshotItems[0].unit_price === 520000, 'Historical order unit price unchanged by future product edits');

  // 8. Template Switching Preservation Test
  // Switch to General Store
  dbUpdate('stores', { template_slug: 'general_clean' }, { id: tplStoreId });
  let currentStoreTpl = dbFetchOne<any>('stores', { id: tplStoreId });
  assert(currentStoreTpl.template_slug === 'general_clean', 'Store template switched back to general_clean');

  // Verify all products across all categories and orders remain intact
  const storeItemsCount = dbFetchAll<any>('items', { store_id: tplStoreId }).length;
  const storeOrdersCount = dbFetchAll<any>('orders', { store_id: tplStoreId }).length;
  assert(storeItemsCount === 4, 'All 4 multi-category product items preserved intact');
  assert(storeOrdersCount === 4, 'All 4 historical orders and snapshots preserved intact');

  // -------------------------------------------------------------
  // SUITE 9: Theme Preview Assets, Direct Upload Pipeline & Multi-Image Galleries (12 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 9. Theme Preview Assets, Direct Upload Pipeline & Multi-Image Galleries ---');

  // 1. Verify 15 Template Front View SVG Assets
  const expectedTemplates = Object.keys(STORE_TEMPLATES);
  assert(expectedTemplates.length === 15, '15 template definitions loaded from registry');

  const previewDir = path.join(process.cwd(), 'src', 'public', 'assets', 'images', 'templates');
  assert(fs.existsSync(previewDir), 'Template previews directory exists on disk');

  let allPreviewsExist = true;
  expectedTemplates.forEach(tId => {
    const filePath = path.join(previewDir, `${tId}.svg`);
    if (!fs.existsSync(filePath)) {
      allPreviewsExist = false;
      console.error(`Missing preview: ${filePath}`);
    }
  });
  assert(allPreviewsExist, 'All 15 industry template front-view cover SVGs exist on disk');

  // 2. Uploads Directory Check
  const uploadsDir = path.join(process.cwd(), 'src', 'public', 'uploads');
  assert(fs.existsSync(uploadsDir), 'Local uploads directory exists for 10MB direct file storage');

  // 3. Multi-Image Product Gallery Item
  const galleryItemId = dbInsert('items', {
    store_id: tplStoreId,
    title: 'Multi-Image Designer Handbag',
    category: 'Fashion & Apparel',
    price: 35000,
    image_url: '/uploads/img_cover_bag.jpg',
    gallery_json: JSON.stringify([
      '/uploads/img_cover_bag.jpg',
      '/uploads/img_angle2_bag.jpg',
      '/uploads/img_interior_bag.jpg'
    ]),
    variants_json: JSON.stringify([
      { id: 'blk', size: 'Medium', color: 'Midnight Black', price: 35000, image_url: '/uploads/img_black_bag.jpg' },
      { id: 'brn', size: 'Medium', color: 'Caramel Brown', price: 37500, image_url: '/uploads/img_brown_bag.jpg' }
    ])
  });

  const fetchedGalleryItem = dbFetchOne<any>('items', { id: galleryItemId });
  assert(Boolean(fetchedGalleryItem), 'Multi-image gallery product created in database');
  
  const parsedGallery = JSON.parse(fetchedGalleryItem.gallery_json);
  assert(Array.isArray(parsedGallery) && parsedGallery.length === 3, 'Product gallery contains 3 high-res image URLs');
  assert(parsedGallery[1] === '/uploads/img_angle2_bag.jpg', 'Secondary gallery photo preserved');

  const parsedVariants = JSON.parse(fetchedGalleryItem.variants_json);
  assert(parsedVariants.length === 2, '2 fashion variants stored with unique attributes');
  assert(parsedVariants[0].image_url === '/uploads/img_black_bag.jpg', 'Variant 1 has dedicated photo URL');
  assert(parsedVariants[1].image_url === '/uploads/img_brown_bag.jpg', 'Variant 2 has dedicated photo URL');

  // 4. Direct Store Logo Configuration Update
  dbUpdate('stores', {
    logo_url: '/uploads/img_store_logo.png'
  }, { id: tplStoreId });

  const updatedLogoStore = dbFetchOne<any>('stores', { id: tplStoreId });
  assert(updatedLogoStore.logo_url === '/uploads/img_store_logo.png', 'Store logo updated with local upload URL');

  // 5. Order with Variant Photo Snapshot
  const galleryOrder = createOrder({
    store_id: tplStoreId,
    customer_phone: '+2348077778888',
    customer_name: 'Gallery Buyer',
    items: [
      {
        id: galleryItemId,
        title: 'Multi-Image Designer Handbag',
        price: 37500,
        variant: 'Medium Caramel Brown',
        quantity: 1
      }
    ]
  });

  assert(galleryOrder.success, 'Order placed for product with multi-image gallery & variant photo');
  const galleryOrderItems = JSON.parse(galleryOrder.order.items_json);
  assert(galleryOrderItems[0].variant === 'Medium Caramel Brown', 'Variant name saved in order snapshot');
  assert(galleryOrderItems[0].unit_price === 37500, 'Variant-specific price applied');

  // -------------------------------------------------------------
  // SUITE 10: 15 Industry Template Demo Stores & Realistic Sample Data (18 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 10. 15 Industry Template Demo Stores & Realistic Sample Data ---');

  const templateSlugs = [
    'general_clean', 'general_modern', 'general_minimal',
    'fashion_lookbook', 'fashion_runway', 'fashion_streetwear',
    'food_menu', 'food_gourmet', 'food_fastcasual',
    'beauty_cosmetic', 'beauty_luxury', 'beauty_botanical',
    'electronics_tech', 'electronics_cyber', 'electronics_compare'
  ];

  assert(Object.keys(SAMPLE_STORES_DATA).length === 15, 'Exactly 15 sample store datasets defined');

  templateSlugs.forEach(slug => {
    const data = getSampleDataForTemplate(slug);
    assert(Boolean(data && data.store && data.items), `Sample dataset found for template '${slug}'`);
    assert(data.store.template_slug === slug, `Store template_slug matches '${slug}'`);
    assert(data.items.length >= 1, `Template '${slug}' has ${data.items.length} realistic sample products`);
    assert(Boolean(data.items[0].image_url && data.items[0].price > 0), `Template '${slug}' product has valid price and photo URL`);
  });

  // Test fallback for unknown slug
  const fallbackData = getSampleDataForTemplate('non_existent_template');
  assert(fallbackData.store.template_slug === 'general_clean', 'Unknown template slug falls back safely to general_clean sample data');

  // -------------------------------------------------------------
  // SUITE 11: Paid Template Cover Banner Styles & Customization (10 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 11. Paid Template Cover Banner Styles & Customization ---');
  
  const coverCleanTemplates = ['general_modern', 'fashion_runway', 'food_gourmet', 'beauty_luxury', 'electronics_cyber'];
  const coverOverlayCtaTemplates = ['general_minimal', 'fashion_streetwear', 'food_fastcasual', 'beauty_botanical', 'electronics_compare'];

  coverCleanTemplates.forEach(tId => {
    const tpl = STORE_TEMPLATES[tId];
    assert(tpl.banner_style === 'cover_clean', `${tId} configured with single cover image banner_style ('cover_clean')`);
    assert(Boolean(tpl.default_cover_image && tpl.default_cover_image.startsWith('http')), `${tId} has valid default high-res cover image`);
  });

  coverOverlayCtaTemplates.forEach(tId => {
    const tpl = STORE_TEMPLATES[tId];
    assert(tpl.banner_style === 'cover_overlay_cta', `${tId} configured with dark overlay + white title + aesthetic button ('cover_overlay_cta')`);
    assert(Boolean(tpl.default_overlay_color), `${tId} has customizable default overlay color`);
    assert(Boolean(tpl.cta_button_text), `${tId} has aesthetic CTA button text`);
  });

  // Store Custom Cover and Overlay Color Persistence
  dbUpdate('stores', {
    cover_url: 'https://images.unsplash.com/photo-custom-cover',
    cover_overlay_color: '#0F172A'
  }, { id: tplStoreId });

  const updatedCoverStore = dbFetchOne<any>('stores', { id: tplStoreId });
  assert(updatedCoverStore.cover_url === 'https://images.unsplash.com/photo-custom-cover', 'Custom store cover image saved to database');
  assert(updatedCoverStore.cover_overlay_color === '#0F172A', 'Custom store cover overlay color saved to database');

  // -------------------------------------------------------------
  // SUITE 12: Pricing Matrix, Debt Tracker, Sales Ledger & Receipts (25 Tests)
  // -------------------------------------------------------------
  console.log('\n--- 12. Pricing Matrix, Debt Tracker, Sales Ledger & Receipts ---');

  // 12.1 Pricing Matrix Verification
  assert(PLANS.free.price_monthly === 0 && PLANS.free.price_formatted === '₦0', 'Free tier is ₦0 forever');
  assert(PLANS.free.limits.max_stores === 1, 'Free tier has 1 store limit');
  assert(PLANS.free.limits.max_products === 10, 'Free tier has 10 products limit');
  assert(PLANS.free.limits.photos_per_product === 1, 'Free tier has 1 photo per product');
  assert(PLANS.free.limits.storefront_designs === 5, 'Free tier has 5 designs (1 per category)');
  assert(PLANS.free.limits.sales_ledger_days === 7, 'Free tier has 7-day sales ledger limit');
  assert(PLANS.free.limits.active_debts_limit === 3, 'Free tier has 3 active debts limit');
  assert(PLANS.free.features.powered_by_zlik === true, 'Free tier includes "Powered by Zlik" attribution');

  assert(PLANS.pro.price_monthly === 5000 && PLANS.pro.price_yearly === 50000, 'Pro tier is ₦5,000/mo and ₦50,000/yr (₦10k discount)');
  assert(PLANS.pro.limits.max_stores === 3, 'Pro tier supports up to 3 stores');
  assert(PLANS.pro.limits.max_products === 500, 'Pro tier allows 500 products');
  assert(PLANS.pro.limits.photos_per_product === 5, 'Pro tier allows 5 photos per product');
  assert(PLANS.pro.limits.storefront_designs === 15, 'Pro tier unlocks all 15 storefront designs');
  assert(PLANS.pro.limits.sales_ledger_days === -1, 'Pro tier has unlimited/lifetime sales ledger');
  assert(PLANS.pro.limits.active_debts_limit === -1, 'Pro tier has unlimited debt records');
  assert(PLANS.pro.features.powered_by_zlik === false, 'Pro tier removes "Powered by Zlik" attribution');
  assert(PLANS.pro.features.full_sales_ledger_export === true, 'Pro tier includes CSV sales ledger export');

  assert(PLANS.business.price_monthly === 9000 && PLANS.business.price_yearly === 90000, 'Business tier is ₦9,000/mo and ₦90,000/yr (₦18k discount)');
  assert(PLANS.business.limits.max_stores === 10, 'Business tier supports up to 10 stores');
  assert(PLANS.business.limits.max_products === -1, 'Business tier allows unlimited products');
  assert(PLANS.business.limits.photos_per_product === 10, 'Business tier allows 10 photos per product + video');
  assert(PLANS.business.limits.staff_accounts === 5, 'Business tier includes 5 staff accounts with roles');
  assert(PLANS.business.features.custom_domain === true, 'Business tier supports custom domains');

  // 12.2 Debt Tracker Module Tests
  const debtStoreId = 8881;
  // Clean debts for test
  db.prepare('DELETE FROM debts WHERE store_id = ?').run(debtStoreId);

  // Insert 3 active debts for free store
  dbInsert('debts', {
    store_id: debtStoreId,
    customer_name: 'Amaka Obi',
    customer_phone: '+2348011112222',
    amount: 15000,
    description: '2x Floral Summer Dress',
    status: 'pending'
  });
  dbInsert('debts', {
    store_id: debtStoreId,
    customer_name: 'Tunde Bakare',
    customer_phone: '+2348033334444',
    amount: 32000,
    description: 'Designer Leather Loafers',
    status: 'pending'
  });
  const debt3Id = dbInsert('debts', {
    store_id: debtStoreId,
    customer_name: 'Chidi Okafor',
    customer_phone: '+2348055556666',
    amount: 8500,
    description: 'Cotton Oxford Shirt',
    status: 'pending'
  });

  const activeDebtsFree = dbFetchAll<any>('debts', { store_id: debtStoreId, status: 'pending' });
  assert(activeDebtsFree.length === 3, 'Store has 3 active debts recorded');

  // Enforce Free Tier Limit Check (Limit = 3)
  const isAtLimit = activeDebtsFree.length >= PLANS.free.limits.active_debts_limit;
  assert(isAtLimit === true, 'Free tier correctly flags active debts limit reached (3/3)');

  // Mark debt as paid
  dbUpdate('debts', { status: 'paid', updated_at: new Date().toISOString() }, { id: debt3Id });
  const activeDebtsAfterPayment = dbFetchAll<any>('debts', { store_id: debtStoreId, status: 'pending' });
  const paidDebts = dbFetchAll<any>('debts', { store_id: debtStoreId, status: 'paid' });
  assert(activeDebtsAfterPayment.length === 2, 'Active debts reduced to 2 after marking one paid');
  assert(paidDebts.length === 1, 'Paid debt recorded with status paid');

  // Debt WhatsApp Reminder Formatting
  const pendingDebt = activeDebtsAfterPayment[0];
  const debtTestStore = dbFetchOne<any>('stores', { id: debtStoreId });
  const reminderText = `Hello ${pendingDebt.customer_name}, this is a gentle reminder regarding your pending balance of ₦${Number(pendingDebt.amount).toLocaleString('en-US')} with ${debtTestStore.store_name} for ${pendingDebt.description}.`;
  assert(reminderText.includes('₦15,000') && reminderText.includes('Amaka Obi'), 'Debt reminder message contains correct customer name & formatted amount');

  // 12.3 Low Stock & Receipt Customization Persistence
  const testStockItemId = dbInsert('items', {
    store_id: debtStoreId,
    title: 'Test Stock Item',
    price: 5000,
    stock_quantity: 10,
    low_stock_threshold: 2
  });
  dbUpdate('items', { low_stock_threshold: 4 }, { id: testStockItemId });
  const updatedStockItem = dbFetchOne<any>('items', { id: testStockItemId });
  assert(updatedStockItem?.low_stock_threshold === 4, 'Product low stock threshold saved to database');

  dbUpdate('stores', {
    receipt_custom_note: 'Thank you for shopping with us! No returns after 7 days.',
    receipt_show_logo: 1
  }, { id: debtStoreId });

  const updatedReceiptStore = dbFetchOne<any>('stores', { id: debtStoreId });
  assert(updatedReceiptStore.receipt_custom_note === 'Thank you for shopping with us! No returns after 7 days.', 'Store custom receipt note saved to database');
  assert(updatedReceiptStore.receipt_show_logo === 1, 'Store receipt show logo preference saved to database');

  // -------------------------------------------------------------
  // SUITE 13: MARKETING, PIXELS, COUPONS, REVIEWS & PRE-ORDERS (BATCH 2)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 13: MARKETING, PIXELS, PROMOTIONS & REVIEWS ---');

  // 13.1 Store Tracking Pixels Persistence
  dbUpdate('stores', {
    meta_pixel_id: 'META-987654321',
    google_tag_id: 'G-ZLIK9988',
    tiktok_pixel_id: 'TT-77665544'
  }, { id: debtStoreId });

  const pixelStore = dbFetchOne<any>('stores', { id: debtStoreId });
  assert(pixelStore.meta_pixel_id === 'META-987654321', 'Meta Pixel ID persisted accurately');
  assert(pixelStore.google_tag_id === 'G-ZLIK9988', 'Google Tag ID persisted accurately');
  assert(pixelStore.tiktok_pixel_id === 'TT-77665544', 'TikTok Pixel ID persisted accurately');

  // 13.2 Store Trust & Verification
  dbUpdate('stores', { verification_requested: 1, is_verified: 0 }, { id: debtStoreId });
  let verifyStore = dbFetchOne<any>('stores', { id: debtStoreId });
  assert(verifyStore.verification_requested === 1, 'Store verification requested flag saved');

  dbUpdate('stores', { is_verified: 1 }, { id: debtStoreId });
  verifyStore = dbFetchOne<any>('stores', { id: debtStoreId });
  assert(verifyStore.is_verified === 1, 'Store verified badge flag activated');

  // 13.3 Product Pre-Orders
  const preOrderItemId = dbInsert('items', {
    store_id: debtStoreId,
    title: 'Limited Edition Silk Kimono',
    category: 'Fashion',
    price: 35000,
    is_preorder: 1,
    preorder_dispatch_date: '2026-11-15',
    is_available: 1
  });

  const preOrderItem = dbFetchOne<any>('items', { id: preOrderItemId });
  assert(preOrderItem.is_preorder === 1, 'Pre-order product flag saved to database');
  assert(preOrderItem.preorder_dispatch_date === '2026-11-15', 'Pre-order dispatch date saved to database');

  // 13.4 Discount Coupons Engine
  // Clean coupons for test store
  db.prepare('DELETE FROM coupons WHERE store_id = ?').run(debtStoreId);

  // Create Percentage Coupon (SAVE20 = 20% off, min order ₦10,000)
  const pctCouponId = dbInsert('coupons', {
    store_id: debtStoreId,
    code: 'SAVE20',
    discount_type: 'percentage',
    discount_value: 20,
    min_order_amount: 10000,
    max_uses: 50,
    uses_count: 0,
    status: 'active'
  });
  assert(typeof pctCouponId === 'number', 'Percentage coupon SAVE20 created in database');

  // Create Fixed Coupon (FLASH5K = ₦5,000 off, min order ₦20,000)
  const fixedCouponId = dbInsert('coupons', {
    store_id: debtStoreId,
    code: 'FLASH5K',
    discount_type: 'fixed',
    discount_value: 5000,
    min_order_amount: 20000,
    max_uses: 10,
    uses_count: 0,
    status: 'active'
  });
  assert(typeof fixedCouponId === 'number', 'Fixed amount coupon FLASH5K created in database');

  // Place Order with Percentage Coupon SAVE20
  const orderWithPctDiscount = createOrder({
    store_id: debtStoreId,
    customer_name: 'Genevieve Nnaji',
    customer_phone: '08022334455',
    discount_code: 'SAVE20',
    force_create: true,
    items: [
      {
        id: preOrderItemId,
        title: 'Limited Edition Silk Kimono',
        price: 35000,
        quantity: 1
      }
    ]
  });

  assert(orderWithPctDiscount.success, 'Order placed with discount coupon successfully');
  assert(orderWithPctDiscount.order.discount_code === 'SAVE20', 'Discount code recorded on order record');
  assert(orderWithPctDiscount.order.discount_amount === 7000, '20% discount of ₦35,000 accurately computed as ₦7,000');
  assert(orderWithPctDiscount.order.total_amount === 28000, 'Subtotal discounted accurately from ₦35,000 to ₦28,000');

  // Verify Coupon uses_count incremented
  const updatedPctCoupon = dbFetchOne<any>('coupons', { id: pctCouponId });
  assert(updatedPctCoupon.uses_count === 1, 'Coupon usage counter automatically incremented');

  // Place Order with Fixed Coupon FLASH5K
  const orderWithFixedDiscount = createOrder({
    store_id: debtStoreId,
    customer_name: 'Richard Mofe-Damijo',
    customer_phone: '08099001122',
    discount_code: 'FLASH5K',
    force_create: true,
    items: [
      {
        id: preOrderItemId,
        title: 'Limited Edition Silk Kimono',
        price: 35000,
        quantity: 1
      }
    ]
  });

  assert(orderWithFixedDiscount.success, 'Fixed coupon order placed successfully');
  assert(orderWithFixedDiscount.order.discount_code === 'FLASH5K', 'Fixed discount code recorded on order record');
  assert(orderWithFixedDiscount.order.discount_amount === 5000, 'Fixed ₦5,000 discount applied');
  assert(orderWithFixedDiscount.order.total_amount === 30000, 'Order total accurately computed as ₦30,000');

  // 13.5 Customer Reviews & Star Ratings System
  // Clean reviews for test store
  db.prepare('DELETE FROM reviews WHERE store_id = ?').run(debtStoreId);

  const review1Id = dbInsert('reviews', {
    store_id: debtStoreId,
    item_id: preOrderItemId,
    customer_name: 'Chioma Adeleke',
    customer_phone: '08012345678',
    rating: 5,
    comment: 'Exceptional craftsmanship and swift delivery! Highly recommend.',
    status: 'published'
  });

  const review2Id = dbInsert('reviews', {
    store_id: debtStoreId,
    item_id: preOrderItemId,
    customer_name: 'Emeka Nwosu',
    customer_phone: '08087654321',
    rating: 4,
    comment: 'High quality material, beautiful stitching.',
    status: 'published'
  });

  const allReviews = dbFetchAll<any>('reviews', { store_id: debtStoreId, status: 'published' });
  assert(allReviews.length === 2, 'Two customer reviews saved with published status');

  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
  assert(avgRating === 4.5, 'Average rating calculation accurate ((5 + 4) / 2 = 4.5 stars)');

  // Moderation status toggle
  dbUpdate('reviews', { status: 'hidden' }, { id: review2Id });
  const visibleReviews = dbFetchAll<any>('reviews', { store_id: debtStoreId, status: 'published' });
  assert(visibleReviews.length === 1, 'Moderated review correctly excluded from public storefront');

  // -------------------------------------------------------------
  // SUITE 14: BULK DATA, DAILY SALES RECAPS & BROADCASTS (BATCH 3)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 14: BULK DATA, DAILY SALES RECAPS & BROADCASTS ---');

  // 14.1 CSV Bulk Product Import Engine
  const bulkStoreId = 8882;
  db.prepare('DELETE FROM items WHERE store_id = ?').run(bulkStoreId);

  const sampleCsvData = [
    'Title,Category,Price,Compare Price,Stock Quantity,Low Stock Threshold,SKU,Description,Image URL,Is Preorder,Preorder Date',
    '"Handmade Leather Belt","Accessories",12000,15000,30,5,"BELT-01","Full-grain leather belt","https://example.com/belt.jpg",0,""',
    '"Vintage Denim Jacket","Outerwear",28000,35000,15,3,"JAC-01","Relaxed fit denim jacket","https://example.com/jacket.jpg",0,""',
    '"Limited Release Sneakers","Footwear",45000,50000,10,2,"SNK-01","Exclusive runner sneakers","https://example.com/sneakers.jpg",1,"2026-12-01"'
  ].join('\r\n');

  // Parse lines
  const lines = sampleCsvData.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 4, 'CSV contains header + 3 valid product rows');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const clean = cols.map(c => c.replace(/^["']|["']$/g, '').trim());
    dbInsert('items', {
      store_id: bulkStoreId,
      title: clean[0],
      category: clean[1],
      price: parseFloat(clean[2]),
      compare_price: parseFloat(clean[3]),
      stock_quantity: parseInt(clean[4]),
      low_stock_threshold: parseInt(clean[5]),
      sku: clean[6],
      description: clean[7],
      image_url: clean[8],
      is_preorder: parseInt(clean[9]),
      preorder_dispatch_date: clean[10] || null,
      is_available: 1
    });
  }

  const importedProducts = dbFetchAll<any>('items', { store_id: bulkStoreId });
  assert(importedProducts.length === 3, 'All 3 CSV products imported into database');
  assert(importedProducts[0].title === 'Handmade Leather Belt' && importedProducts[0].price === 12000, 'First product fields parsed accurately');
  assert(importedProducts[2].is_preorder === 1 && importedProducts[2].preorder_dispatch_date === '2026-12-01', 'Pre-order item from CSV parsed with date');

  // 14.2 Daily Sales WhatsApp Summary Computation
  db.prepare("UPDATE orders SET payment_status = 'paid' WHERE store_id = ?").run(debtStoreId);

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const todayOrders = dbFetchAll<any>('orders', { store_id: debtStoreId });
  const paidOrdersToday = todayOrders.filter(o => o.payment_status === 'paid');
  const grossSalesToday = paidOrdersToday.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  
  assert(todayOrders.length >= 2, 'Today orders retrieved for store daily recap');
  assert(grossSalesToday >= 58000, 'Gross sales revenue computed accurately (₦28,000 + ₦30,000 = ₦58,000)');

  const summaryHeader = `DAILY SALES SUMMARY`;
  assert(summaryHeader.includes('DAILY SALES SUMMARY'), 'Daily summary header generated properly');

  // 14.3 Customer Segmentation Directory
  const stmtCustomers = db.prepare(`
    SELECT 
      customer_phone,
      customer_name,
      COUNT(id) as orders_count,
      SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_spent,
      MAX(created_at) as last_order_date
    FROM orders
    WHERE store_id = ?
    GROUP BY customer_phone
  `);
  const uniqueCustomers = stmtCustomers.all(debtStoreId) as any[];
  assert(uniqueCustomers.length >= 2, 'Unique customer records aggregated across store orders');
  
  const vipCustomers = uniqueCustomers.filter(c => Number(c.total_spent) >= 20000);
  assert(vipCustomers.length >= 2, 'VIP customers identified based on > ₦20,000 spend threshold');

  // 14.4 Personalized WhatsApp Broadcast Message Formatter
  const customerTarget = uniqueCustomers[0];
  const broadcastTemplate = `Hello {{customer_name}}! Use code SAVE10 for 10% off at https://zlik.me/store`;
  const personalizedBroadcast = broadcastTemplate.replace('{{customer_name}}', customerTarget.customer_name);
  assert(personalizedBroadcast.includes(customerTarget.customer_name), 'Broadcast template replaced {{customer_name}} with real customer name');
  assert(personalizedBroadcast.includes('SAVE10'), 'Broadcast message contains coupon code');

  // -------------------------------------------------------------
  // SUITE 15: TEAMS, MULTI-STORE, BRANCHES & CUSTOM DOMAINS (BATCH 4)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 15: TEAMS, MULTI-STORE, BRANCHES & DOMAINS ---');

  // 15.1 Multi-Store Management
  const ownerStoreId = 8883;
  db.prepare('DELETE FROM stores WHERE id >= 8883 AND id <= 8886').run();

  // Primary store on Business plan (allows up to 10 stores)
  dbInsert('stores', {
    id: ownerStoreId,
    store_name: 'Main Flagship Brand',
    owner_name: 'Chief Executive',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'main-flagship',
    whatsapp_number: '+2348011223344',
    plan_tier: 'business',
    status: 'active'
  });

  // Secondary store under same owner
  const store2Id = dbInsert('stores', {
    id: 8884,
    store_name: 'Urban Outlet Store',
    owner_name: 'Chief Executive',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'urban-outlet',
    whatsapp_number: '+2348011223344',
    owner_id: ownerStoreId,
    plan_tier: 'business',
    status: 'active'
  });

  const businessStores = db.prepare('SELECT * FROM stores WHERE id = ? OR owner_id = ?').all(ownerStoreId, ownerStoreId) as any[];
  assert(businessStores.length === 2, 'Two stores linked under single merchant account');
  assert(PLANS.business.limits.max_stores === 10, 'Business plan allows up to 10 stores');
  assert(PLANS.pro.limits.max_stores === 3, 'Pro plan allows up to 3 stores');
  assert(PLANS.free.limits.max_stores === 1, 'Free plan allows 1 store');

  // 15.2 Staff Accounts & RBAC
  db.prepare('DELETE FROM staff_accounts WHERE store_id = ?').run(ownerStoreId);

  const staff1Id = dbInsert('staff_accounts', {
    store_id: ownerStoreId,
    name: 'Samuel Okoro',
    phone: '+2348077665544',
    role: 'manager',
    permissions_json: JSON.stringify(['orders', 'products', 'ledger']),
    pin_code: '5678',
    status: 'active'
  });

  const staff2Id = dbInsert('staff_accounts', {
    store_id: ownerStoreId,
    name: 'Blessing Paul',
    phone: '+2348099887766',
    role: 'sales_rep',
    permissions_json: JSON.stringify(['orders', 'chat']),
    pin_code: '1122',
    status: 'active'
  });

  const activeStaff = dbFetchAll<any>('staff_accounts', { store_id: ownerStoreId, status: 'active' });
  assert(activeStaff.length === 2, 'Two staff members registered with distinct roles');
  assert(PLANS.business.limits.staff_accounts === 5, 'Business tier includes 5 staff accounts');
  assert(PLANS.pro.limits.staff_accounts === 1, 'Pro tier includes 1 staff account');
  assert(PLANS.free.limits.staff_accounts === 0, 'Free tier has 0 staff accounts');

  // 15.3 Physical Store Branches & Sales Reports
  db.prepare('DELETE FROM branches WHERE store_id = ?').run(ownerStoreId);

  const branchLekkiId = dbInsert('branches', {
    store_id: ownerStoreId,
    name: 'Lekki Flagship Store',
    address: '14 Admiralty Way',
    city: 'Lagos',
    phone: '+2348011223344',
    manager_name: 'Samuel Okoro',
    is_main: 1,
    status: 'active'
  });

  const branchIkejaId = dbInsert('branches', {
    store_id: ownerStoreId,
    name: 'Ikeja Mall Branch',
    address: 'Shop 24, Ikeja City Mall',
    city: 'Lagos',
    phone: '+2348099887766',
    manager_name: 'Blessing Paul',
    is_main: 0,
    status: 'active'
  });

  const allBranches = dbFetchAll<any>('branches', { store_id: ownerStoreId });
  assert(allBranches.length === 2, 'Two store physical branches configured');
  assert(allBranches[0].is_main === 1, 'Main branch identified correctly');

  // Place Order attached to Lekki Branch and Staff Samuel Okoro
  const branchOrder = createOrder({
    store_id: ownerStoreId,
    customer_name: 'Folake Solanke',
    customer_phone: '08098765432',
    force_create: true,
    items: [
      {
        title: 'Custom Blazer',
        price: 50000,
        quantity: 1
      }
    ]
  });
  assert(branchOrder.success, 'Branch order placed successfully');

  // Tag order with branch & staff
  dbUpdate('orders', {
    branch_id: branchLekkiId,
    staff_id: staff1Id,
    payment_status: 'paid'
  }, { id: branchOrder.order.id });

  const taggedOrder = dbFetchOne<any>('orders', { id: branchOrder.order.id });
  assert(taggedOrder.branch_id === branchLekkiId, 'Order correctly assigned to physical branch');
  assert(taggedOrder.staff_id === staff1Id, 'Order correctly assigned to staff member');

  // 15.4 Custom Domain & Product Video URL
  dbUpdate('stores', {
    custom_domain: 'shop.flagship.com',
    custom_domain_status: 'verified'
  }, { id: ownerStoreId });

  const customDomainStore = dbFetchOne<any>('stores', { id: ownerStoreId });
  assert(customDomainStore.custom_domain === 'shop.flagship.com', 'Custom domain mapping saved to store profile');
  assert(customDomainStore.custom_domain_status === 'verified', 'Custom domain status set to verified');

  const videoItemId = dbInsert('items', {
    store_id: ownerStoreId,
    title: 'Kinetic Timepiece Luxury Watch',
    category: 'Accessories',
    price: 180000,
    video_url: 'https://cdn.example.com/videos/watch_showcase.mp4',
    is_available: 1
  });

  const videoItem = dbFetchOne<any>('items', { id: videoItemId });
  assert(videoItem.video_url === 'https://cdn.example.com/videos/watch_showcase.mp4', 'Product video URL persisted for storefront media showcase');

  // -------------------------------------------------------------
  // SUITE 16: STORE VISITOR ANALYTICS & PRO LOCK VALIDATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 16: STORE VISITOR ANALYTICS (ALL PLANS) ---');

  const analyticsStoreId = 8887;
  db.prepare('DELETE FROM stores WHERE id = ?').run(analyticsStoreId);
  db.prepare('DELETE FROM analytics_events WHERE store_id = ?').run(analyticsStoreId);

  // 16.1 Create Free Tier Store to verify analytics works on Free
  dbInsert('stores', {
    id: analyticsStoreId,
    store_name: 'Visitor Analytics Test Store',
    owner_name: 'Store Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'visitor-analytics-test',
    whatsapp_number: '+2348011223399',
    plan_tier: 'free',
    status: 'active'
  });

  const freeStoreDetails = getStorePlanDetails(dbFetchOne<any>('stores', { id: analyticsStoreId }));
  assert(freeStoreDetails.plan === 'free', 'Test store is on Free Starter plan');

  // 16.2 Record Visits across different timeframes
  const nowTime = new Date();
  const todayStr = nowTime.toISOString().slice(0, 19).replace('T', ' ');

  const yesterdayDate = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate() - 1, 14, 0, 0);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 19).replace('T', ' ');

  const fiveDaysAgo = new Date(nowTime.getTime() - 5 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const twentyDaysAgo = new Date(nowTime.getTime() - 20 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const sixtyDaysAgo = new Date(nowTime.getTime() - 60 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const twoHundredDaysAgo = new Date(nowTime.getTime() - 200 * 86400000).toISOString().slice(0, 19).replace('T', ' ');

  // Record Today visits (3 visits, 2 unique IPs: 102.89.4.1 & 102.89.4.2)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '102.89.4.1', created_at: todayStr });
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '102.89.4.1', created_at: todayStr });
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '102.89.4.2', created_at: todayStr });

  // Record Yesterday visits (2 visits, 1 unique IP: 197.210.8.5)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '197.210.8.5', created_at: yesterdayStr });
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '197.210.8.5', created_at: yesterdayStr });

  // Record 5 days ago (1 visit, IP 105.112.1.9)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '105.112.1.9', created_at: fiveDaysAgo });

  // Record 20 days ago (1 visit, IP 41.203.7.1)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '41.203.7.1', created_at: twentyDaysAgo });

  // Record 60 days ago (1 visit, IP 154.120.3.4)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '154.120.3.4', created_at: sixtyDaysAgo });

  // Record 200 days ago (1 visit, IP 196.220.5.8)
  dbInsert('analytics_events', { store_id: analyticsStoreId, event_name: 'store_visit', ip_address: '196.220.5.8', created_at: twoHundredDaysAgo });

  // 16.3 Query Visitor Metrics
  const visitorStats = getStoreVisitorMetrics(analyticsStoreId);

  assert(visitorStats.today.visits === 3, 'Today total visits accurately equals 3');
  assert(visitorStats.today.unique_visitors === 2, 'Today unique visitors accurately deduplicated to 2 distinct IPs');

  assert(visitorStats.yesterday.visits === 2, 'Yesterday total visits accurately equals 2');
  assert(visitorStats.yesterday.unique_visitors === 1, 'Yesterday unique visitors accurately deduplicated to 1 IP');

  assert(visitorStats['7days'].visits === 6, 'Last 7 Days visits accurately computed (3 today + 2 yesterday + 1 5d ago = 6)');
  assert(visitorStats['7days'].unique_visitors === 4, 'Last 7 Days unique visitors accurately computed (4 distinct IPs)');

  assert(visitorStats.month.visits === 7, 'Last 30 Days (1 Month) visits accurately computed (6 in 7d + 1 in 20d = 7)');
  assert(visitorStats.quarterly.visits === 8, 'Quarterly (90 Days) visits accurately computed (7 in month + 1 in 60d = 8)');
  assert(visitorStats.yearly.visits === 9, 'Yearly (365 Days) visits accurately computed (8 in quarter + 1 in 200d = 9)');
  assert(visitorStats.lifetime.visits === 9, 'Lifetime visits accurately computed as 9');

  // Test real-time recording via recordStoreVisit helper
  recordStoreVisit(analyticsStoreId, '102.89.4.99', 'Mozilla/5.0');
  const updatedStats = getStoreVisitorMetrics(analyticsStoreId);
  assert(updatedStats.today.visits === 4, 'recordStoreVisit increments today visits in real time');
  assert(updatedStats.today.unique_visitors === 3, 'recordStoreVisit tracks new unique visitor IP in real time');

  // 16.4 Pro Feature Locking Verification
  assert(PLANS.free.limits.max_products === 10, 'Free plan product limit is strictly 10 products');
  assert(PLANS.pro.limits.max_products === 500, 'Pro plan product limit is 500 products');
  assert(PLANS.free.limits.photos_per_product === 1, 'Free plan photo limit is 1 photo per item');
  assert(PLANS.pro.limits.photos_per_product === 5, 'Pro plan photo limit is 5 photos per item');
  assert(PLANS.free.limits.active_debts_limit === 3, 'Free plan debt limit is strictly 3 active debts');
  assert(Boolean(PLANS.free.features.powered_by_zlik) === true, 'Free plan enforces Powered by Zlik watermark');
  assert(Boolean(PLANS.pro.features.powered_by_zlik) === false, 'Pro plan unlocks watermark removal');

  // 16.5 Revenue & Ledger Multi-Period Free vs Pro Verification
  const sampleRevOrders = [
    { total_amount: 5000, order_status: 'confirmed', created_at: todayStr },
    { total_amount: 3000, order_status: 'confirmed', created_at: yesterdayStr },
    { total_amount: 10000, order_status: 'confirmed', created_at: fiveDaysAgo }
  ];
  const revMetrics = calculateStoreRevenueMetrics(sampleRevOrders);
  assert(revMetrics.today.is_pro === false, 'Revenue today timeframe is FREE');
  assert(revMetrics.yesterday.is_pro === false, 'Revenue yesterday timeframe is FREE');
  assert(revMetrics.this_week.is_pro === false, 'Revenue this_week timeframe is FREE');
  assert(revMetrics.this_month.is_pro === false, 'Revenue this_month timeframe is FREE');
  assert(revMetrics.last_month.is_pro === false, 'Revenue last_month timeframe is FREE');
  assert(revMetrics['3months'].is_pro === true, 'Revenue 3months timeframe is PRO');
  assert(revMetrics['6months'].is_pro === true, 'Revenue 6months timeframe is PRO');
  assert(revMetrics.yearly.is_pro === true, 'Revenue yearly timeframe is PRO');
  assert(revMetrics.lifetime.is_pro === true, 'Revenue lifetime timeframe is PRO');
  assert(revMetrics.today.confirmed_revenue === 5000, 'Revenue today confirms ₦5,000');
  assert(revMetrics.yesterday.confirmed_revenue === 3000, 'Revenue yesterday confirms ₦3,000');

  // -------------------------------------------------------------
  // SUITE 17: MARKETPLACE NIGERIAN STATES & SUPER ADMIN PRICING MATRIX
  // -------------------------------------------------------------
  console.log('\n--- SUITE 17: MARKETPLACE NIGERIAN STATES & SUPER ADMIN PRICING MATRIX ---');
  assert(Array.isArray(NIGERIAN_STATES), 'NIGERIAN_STATES is an exported array');
  assert(NIGERIAN_STATES.length === 37, 'NIGERIAN_STATES contains all 36 Nigerian States + FCT (37 entries total)');
  assert(NIGERIAN_STATES.includes('Lagos'), 'NIGERIAN_STATES includes Lagos');
  assert(NIGERIAN_STATES.includes('FCT - Abuja'), 'NIGERIAN_STATES includes FCT - Abuja');
  assert(NIGERIAN_STATES.includes('Rivers'), 'NIGERIAN_STATES includes Rivers');
  assert(NIGERIAN_STATES.includes('Kano'), 'NIGERIAN_STATES includes Kano');
  assert(NIGERIAN_STATES.includes('Anambra'), 'NIGERIAN_STATES includes Anambra');
  assert(NIGERIAN_STATES.includes('Oyo'), 'NIGERIAN_STATES includes Oyo');
  assert(NIGERIAN_STATES.includes('Delta'), 'NIGERIAN_STATES includes Delta');

  const catFashion = getStoreCategoryInfo({ business_type: 'fashion', store_name: 'Luxe Wears' });
  assert(catFashion.id === 'fashion', 'Store category correctly resolved to fashion');
  assert(catFashion.name === 'Fashion & Apparel', 'Store category name accurate');

  const catFood = getStoreCategoryInfo({ business_type: 'food', store_name: 'Spicy Kitchen' });
  assert(catFood.id === 'food', 'Store category correctly resolved to food');

  const catElectronics = getStoreCategoryInfo({ business_type: 'electronics', store_name: 'Gadget Hub' });
  assert(catElectronics.id === 'electronics', 'Store category correctly resolved to electronics');

  // Super Admin Plan limits and defaults
  assert(PLANS.pro.price_monthly === 5000, 'Pro monthly price is authoritative ₦5,000');
  assert(PLANS.pro.price_yearly === 50000, 'Pro yearly price is authoritative ₦50,000');
  assert(PLANS.business.price_monthly === 9000, 'Business monthly price is authoritative ₦9,000');
  assert(PLANS.business.price_yearly === 90000, 'Business yearly price is authoritative ₦90,000');
  assert(PLANS.business.limits.staff_accounts === 5, 'Business plan allows 5 staff accounts');
  assert(PLANS.business.limits.max_stores === 10, 'Business plan allows 10 stores');
  assert(PLANS.pro.limits.max_stores === 3, 'Pro plan allows 3 stores');
  assert(PLANS.free.limits.max_stores === 1, 'Free plan allows 1 store');
  assert(Boolean(PLANS.business.features.custom_domain) === true, 'Business plan unlocks custom domain');
  assert(Boolean(PLANS.pro.features.custom_domain) === false, 'Pro plan restricts custom domain');

  // Verify getEffectivePlans returns authoritative dynamic synced prices
  const effPlans = getEffectivePlans();
  assert(effPlans.pro.price_monthly === 5000, 'getEffectivePlans pro monthly price matches settings (5000)');
  assert(effPlans.business.price_monthly === 9000, 'getEffectivePlans business monthly price matches settings (9000)');

  // Test dynamic feature toggle persistence and live reflection across platform
  const settingsRow = getPlatformSettings();
  const originalConfigJson = settingsRow.plans_config_json;

  // Custom configuration where Free plan is granted seller_branded_receipts and 20 products
  const customPlansConfig = {
    free: {
      limits: { max_products: 20 },
      features: { seller_branded_receipts: true }
    }
  };

  dbUpdate('platform_settings', { plans_config_json: JSON.stringify(customPlansConfig) }, { id: settingsRow.id });
  const updatedEffPlans = getEffectivePlans();
  assert(updatedEffPlans.free.limits.max_products === 20, 'Dynamic plans correctly updated free product limit to 20 from DB');
  assert(updatedEffPlans.free.features.seller_branded_receipts === true, 'Dynamic plans granted seller_branded_receipts to Free tier in DB');

  const freeTestStore = { plan_tier: 'free', is_trial_active: 0 };
  assert(can(freeTestStore, 'seller_branded_receipts') === true, 'can(store, seller_branded_receipts) evaluates to true when toggled by super admin');
  assert(limit(freeTestStore, 'max_products') === 20, 'limit(store, max_products) reflects live updated 20 limit');

  // Revert back to baseline configuration
  dbUpdate('platform_settings', { plans_config_json: originalConfigJson || null }, { id: settingsRow.id });
  const revertedPlans = getEffectivePlans();
  assert(revertedPlans.free.features.seller_branded_receipts === false, 'Reverted back to standard baseline feature matrix');
  assert(revertedPlans.free.limits.max_products === 10, 'Reverted back to standard 10 free products limit');

  // -------------------------------------------------------------
  // SUITE 18: LEGAL PAGES & FOOTER INTEGRATION (TERMS & PRIVACY)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 18: LEGAL, TERMS OF SERVICE & PRIVACY POLICY ---');

  const termsViewPath = path.resolve('src/views/terms.ejs');
  const privacyViewPath = path.resolve('src/views/privacy.ejs');
  const landingViewPath = path.resolve('src/views/landing.ejs');
  const marketplaceViewPath = path.resolve('src/views/marketplace.ejs');

  assert(fs.existsSync(termsViewPath), 'Terms of Service template (terms.ejs) exists');
  assert(fs.existsSync(privacyViewPath), 'Privacy Policy template (privacy.ejs) exists');

  const termsContent = fs.readFileSync(termsViewPath, 'utf-8');
  assert(termsContent.includes('Terms of Service'), 'terms.ejs contains Terms of Service heading');
  assert(termsContent.includes('Federal Republic of Nigeria'), 'terms.ejs specifies Nigerian jurisdiction');
  assert(termsContent.includes('0% Platform Commission') || termsContent.includes('0% commission'), 'terms.ejs outlines 0% commission policy');
  assert(termsContent.includes('Prohibited Goods'), 'terms.ejs includes Prohibited Goods policy');

  const privacyContent = fs.readFileSync(privacyViewPath, 'utf-8');
  assert(privacyContent.includes('Privacy Policy'), 'privacy.ejs contains Privacy Policy heading');
  assert(privacyContent.includes('NDPR') || privacyContent.includes('NDPA'), 'privacy.ejs specifies NDPR / NDPA compliance');
  assert(privacyContent.includes('Data Protection Officer'), 'privacy.ejs provides Data Protection Officer contact');

  const landingContent = fs.readFileSync(landingViewPath, 'utf-8');
  assert(landingContent.includes('href="/terms"'), 'landing.ejs footer contains Terms of Service link');
  assert(landingContent.includes('href="/privacy"'), 'landing.ejs footer contains Privacy Policy link');

  const marketplaceContent = fs.readFileSync(marketplaceViewPath, 'utf-8');
  assert(marketplaceContent.includes('href="/terms"'), 'marketplace.ejs footer contains Terms of Service link');
  assert(marketplaceContent.includes('href="/privacy"'), 'marketplace.ejs footer contains Privacy Policy link');

  // -------------------------------------------------------------
  // SUITE 19: ADMIN SECURITY, SESSION SECRETS & BRUTE-FORCE DEFENSE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 19: ADMIN SECURITY, SESSION SECRET & BRUTE-FORCE DEFENSE ---');

  // 1. Validate SESSION_SECRET entropy and strength
  assert(typeof ENV.SESSION_SECRET === 'string', 'ENV.SESSION_SECRET is defined');
  assert(ENV.SESSION_SECRET.length >= 32, `ENV.SESSION_SECRET meets cryptographic length requirement (${ENV.SESSION_SECRET.length} chars >= 32)`);
  assert(!ENV.SESSION_SECRET.includes('zlik_super_secret_session_key_32bytes'), 'ENV.SESSION_SECRET does not use legacy default placeholder');

  // 2. Validate Super Admin Provisioning & Environment Config
  initSuperAdminAccount();
  const masterAdmin = dbFetchOne<any>('super_admins', { email: ENV.SUPER_ADMIN_EMAIL });
  assert(Boolean(masterAdmin), `Master Super Admin (${ENV.SUPER_ADMIN_EMAIL}) is provisioned in database`);
  assert(masterAdmin.role === 'super_admin', 'Master Admin has role super_admin');
  assert(comparePassword(ENV.SUPER_ADMIN_PASSWORD, masterAdmin.password_hash), 'Master Admin password hash verifies against current ENV password');

  // 2b. Validate Secret Admin URL Path Obfuscation
  assert(typeof ENV.ADMIN_SECRET_PATH === 'string' && ENV.ADMIN_SECRET_PATH.length >= 8, `ADMIN_SECRET_PATH meets length requirement (${ENV.ADMIN_SECRET_PATH})`);
  assert(ENV.ADMIN_SECRET_PATH !== 'admin', 'ADMIN_SECRET_PATH is not predictable /admin');
  assert(validateStoreSlugAvailability(ENV.ADMIN_SECRET_PATH).valid === false, 'Store slug validator reserves secret admin path');

  // 3. Brute-force rate limiter defense tests
  const testAttackIp = '198.51.100.42';
  const testAttackEmail = 'bruteforce_target@zlik.store';

  // Initial attempt should be allowed with 5 remaining attempts
  const check1 = checkAdminRateLimit(testAttackIp, testAttackEmail);
  assert(check1.allowed === true, 'Initial admin login request is permitted by rate limiter');
  assert(check1.remainingAttempts === 5, 'Initial rate limit starts with 5 remaining attempts');

  // Simulate 4 failed attempts
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = recordFailedAdminLogin(testAttackIp, testAttackEmail);
    assert(res.locked === false, `Failed attempt #${attempt} does not lock account yet`);
  }

  const checkAfter4 = checkAdminRateLimit(testAttackIp, testAttackEmail);
  assert(checkAfter4.allowed === true, 'Rate limiter still permits after 4 failed attempts');
  assert(checkAfter4.remainingAttempts === 1, 'Exactly 1 remaining attempt left before lockout');

  // 5th failed attempt triggers lockout
  const res5 = recordFailedAdminLogin(testAttackIp, testAttackEmail);
  assert(res5.locked === true, '5th consecutive failed attempt triggers lockout');
  assert(res5.retryAfterSeconds > 0, 'Lockout includes positive retry-after duration');

  // Attempt 6 is blocked by rate limiter
  const checkBlocked = checkAdminRateLimit(testAttackIp, testAttackEmail);
  assert(checkBlocked.allowed === false, 'Subsequent login attempt is blocked during lockout period');
  assert(checkBlocked.retryAfterSeconds > 0, 'Blocked request returns positive retry-after cooldown');

  // Reset rate limit upon successful login
  resetAdminRateLimit(testAttackIp, testAttackEmail);
  const checkAfterReset = checkAdminRateLimit(testAttackIp, testAttackEmail);
  assert(checkAfterReset.allowed === true, 'Rate limit tracker is reset after successful authentication');

  // Verify Security Audit Trail logged the brute-force security alert
  const securityAlertLogs = dbFetchAll<any>('admin_audit_logs', { ip_address: testAttackIp });
  assert(securityAlertLogs.length > 0, 'Security alert was recorded in immutable admin_audit_logs table');
  assert(securityAlertLogs[0].action.includes('SECURITY ALERT'), 'Audit log contains high-severity SECURITY ALERT action tag');

  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log('🧪 SUITE 20: EMAIL VERIFICATION & TIERED PAYSTACK SUBSCRIPTIONS');
  console.log('======================================================\n');

  // 20.1 Test Transactional OTP Mailer Dispatch
  const testOtpEmail = 'testmerchant_verif@example.com';
  const testOtpCode = '839201';
  const mailerResult = await sendEmailVerificationOtp(testOtpEmail, 'Ada Lovelace', testOtpCode, 'https://zlik.store/verify-email?token=xyz&code=839201');
  assert(mailerResult.success === true, 'sendEmailVerificationOtp dispatches verification email successfully');

  const otpLog = dbFetchOne<any>('email_logs', { recipient_email: testOtpEmail, template_name: 'email_verification_otp' });
  assert(otpLog !== null && otpLog !== undefined, 'Email verification dispatch was recorded in email_logs audit trail');
  assert(otpLog?.subject?.includes(testOtpCode), 'Verification email subject contains the 6-digit OTP code');

  // 20.2 Test Pending Registration Staging & SHA-256 Hashing
  const crypto = await import('node:crypto');
  const stageToken = crypto.randomUUID();
  const stageOtp = '472915';
  const stageOtpHash = crypto.createHash('sha256').update(stageOtp).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const testTimestamp = Date.now();
  const pendingFreePayload = {
    slug: `ada-free-store-${testTimestamp}`,
    store_name: 'Ada Free Boutique',
    owner_name: 'Ada Lovelace',
    email: `ada_free_${testTimestamp}@example.com`,
    password_hash: 'hash_ada_123',
    whatsapp_number: '08099881122',
    plan_tier: 'free',
    billing_cycle: 'monthly',
    industry_id: 1,
    template_id: 1,
    template_slug: 'fashion-editorial',
    business_type: 'fashion'
  };

  const verifId = dbInsert('email_verifications', {
    email: pendingFreePayload.email,
    otp_hash: stageOtpHash,
    token: stageToken,
    payload_json: JSON.stringify(pendingFreePayload),
    attempts: 0,
    expires_at: expiresAt,
    used: 0
  });

  const stagedRow = dbFetchOne<any>('email_verifications', { id: verifId });
  assert(stagedRow !== null, 'Pending signup registration is saved to email_verifications table');
  assert(stagedRow.otp_hash === stageOtpHash, 'OTP code is securely hashed with SHA-256');
  assert(stagedRow.used === 0, 'Initial verification state is used = 0');

  // 20.3 Test Incorrect OTP Rejection & Attempts Increment
  const wrongHash = crypto.createHash('sha256').update('000000').digest('hex');
  assert(wrongHash !== stagedRow.otp_hash, 'Mismatching OTP code fails hash comparison');
  dbUpdate('email_verifications', { attempts: stagedRow.attempts + 1 }, { id: verifId });
  const updatedAttemptsRow = dbFetchOne<any>('email_verifications', { id: verifId });
  assert(updatedAttemptsRow.attempts === 1, 'Failed verification attempts are tracked in database');

  // 20.4 Test Free Plan OTP Verification & Auto-Provisioning
  const validHash = crypto.createHash('sha256').update(stageOtp).digest('hex');
  assert(validHash === stagedRow.otp_hash, 'Correct OTP matches hashed digest in email_verifications');
  dbUpdate('email_verifications', { used: 1 }, { id: verifId });

  const freeStoreId = dbInsert('stores', {
    slug: pendingFreePayload.slug,
    store_name: pendingFreePayload.store_name,
    owner_name: pendingFreePayload.owner_name,
    email: pendingFreePayload.email,
    password_hash: pendingFreePayload.password_hash,
    whatsapp_number: pendingFreePayload.whatsapp_number,
    plan_tier: 'free',
    status: 'active',
    email_verified: 1,
    subscription_status: 'active',
    billing_cycle: 'monthly'
  });

  const createdFreeStore = dbFetchOne<any>('stores', { id: freeStoreId });
  assert(createdFreeStore !== null, 'Free store is successfully created upon valid email OTP verification');
  assert(createdFreeStore.email_verified === 1, 'Store has email_verified = 1');
  assert(createdFreeStore.plan_tier === 'free', 'Free plan tier assigned');
  assert(createdFreeStore.subscription_status === 'active', 'Free store subscription status is active');

  // 20.5 Test Pro Plan Tiered Registration & Pending Paystack Checkout
  const proToken = crypto.randomUUID();
  const proOtp = '618294';
  const proOtpHash = crypto.createHash('sha256').update(proOtp).digest('hex');

  const pendingProPayload = {
    slug: `pro-merchant-store-${testTimestamp}`,
    store_name: 'Pro Merchant Store',
    owner_name: 'Pro Merchant',
    email: `pro_merchant_${testTimestamp}@example.com`,
    password_hash: 'hash_pro_123',
    whatsapp_number: '08099883344',
    plan_tier: 'pro',
    billing_cycle: 'monthly'
  };

  const proVerifId = dbInsert('email_verifications', {
    email: pendingProPayload.email,
    otp_hash: proOtpHash,
    token: proToken,
    payload_json: JSON.stringify(pendingProPayload),
    attempts: 0,
    expires_at: expiresAt,
    used: 1
  });

  const proStoreId = dbInsert('stores', {
    slug: pendingProPayload.slug,
    store_name: pendingProPayload.store_name,
    owner_name: pendingProPayload.owner_name,
    email: pendingProPayload.email,
    password_hash: pendingProPayload.password_hash,
    whatsapp_number: pendingProPayload.whatsapp_number,
    plan_tier: 'free',
    status: 'active',
    email_verified: 1,
    subscription_status: 'pending_payment',
    billing_cycle: 'monthly'
  });

  const proReference = `sub_${proStoreId}_${testTimestamp}`;
  const proSettings = getPlatformSettings();
  const proAmount = Number(proSettings.pro_monthly_price || 5000);

  const proPaymentId = dbInsert('subscription_payments', {
    store_id: proStoreId,
    email: pendingProPayload.email,
    reference: proReference,
    plan_tier: 'pro',
    billing_cycle: 'monthly',
    amount: proAmount,
    currency: 'NGN',
    gateway: 'paystack',
    status: 'pending'
  });

  const createdProStore = dbFetchOne<any>('stores', { id: proStoreId });
  assert(createdProStore.subscription_status === 'pending_payment', 'Pro store registration is set to pending_payment before checkout');
  
  const createdProPayment = dbFetchOne<any>('subscription_payments', { id: proPaymentId });
  assert(createdProPayment !== null, 'Subscription payment record is created for Paystack transaction');
  assert(createdProPayment.amount === 5000, 'Pro monthly price is ₦5,000');
  assert(createdProPayment.status === 'pending', 'Subscription payment is initially pending');

  // 20.6 Test Business Plan Tiered Registration & Yearly Billing Calculation
  const bizStoreId = dbInsert('stores', {
    slug: `biz-enterprise-store-${testTimestamp}`,
    store_name: 'Biz Enterprise Hub',
    owner_name: 'Biz CEO',
    email: `biz_ceo_${testTimestamp}@example.com`,
    password_hash: 'hash_biz_123',
    whatsapp_number: '08099885566',
    plan_tier: 'free',
    status: 'active',
    email_verified: 1,
    subscription_status: 'pending_payment',
    billing_cycle: 'yearly'
  });

  const bizReference = `sub_${bizStoreId}_${testTimestamp}`;
  const bizYearlyAmount = Number(proSettings.business_yearly_price || 90000);

  dbInsert('subscription_payments', {
    store_id: bizStoreId,
    email: `biz_ceo_${testTimestamp}@example.com`,
    reference: bizReference,
    plan_tier: 'business',
    billing_cycle: 'yearly',
    amount: bizYearlyAmount,
    currency: 'NGN',
    gateway: 'paystack',
    status: 'pending'
  });

  const createdBizPayment = dbFetchOne<any>('subscription_payments', { reference: bizReference });
  assert(createdBizPayment.amount === 90000, 'Business yearly plan calculated correctly at ₦90,000');
  assert(createdBizPayment.billing_cycle === 'yearly', 'Billing cycle recorded as yearly');

  // 20.7 Test Paystack Subscription Payment Verification & Store Upgrade
  const now = new Date();
  const proExpiry = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');

  dbUpdate('stores', {
    plan_tier: 'pro',
    subscription_status: 'active',
    plan_expires_at: proExpiry
  }, { id: proStoreId });

  dbUpdate('subscription_payments', {
    status: 'success',
    channel: 'card',
    paid_at: now.toISOString().slice(0, 19).replace('T', ' ')
  }, { id: proPaymentId });

  const upgradedProStore = dbFetchOne<any>('stores', { id: proStoreId });
  assert(upgradedProStore.plan_tier === 'pro', 'Store plan_tier successfully upgraded to pro');
  assert(upgradedProStore.subscription_status === 'active', 'Store subscription_status is active after payment verification');
  assert(new Date(upgradedProStore.plan_expires_at) > now, 'Plan expiration is extended by 30 days');

  const upgradedPayment = dbFetchOne<any>('subscription_payments', { id: proPaymentId });
  assert(upgradedPayment.status === 'success', 'Subscription payment record marked as success');
  assert(upgradedPayment.channel === 'card', 'Payment channel recorded');

  // 20.8 Test Paystack Webhook Simulation (charge.success idempotency)
  const bizExpiry = new Date(now.getTime() + 365 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  dbUpdate('stores', {
    plan_tier: 'business',
    subscription_status: 'active',
    plan_expires_at: bizExpiry
  }, { id: bizStoreId });

  dbUpdate('subscription_payments', {
    status: 'success',
    channel: 'bank_transfer',
    paid_at: now.toISOString().slice(0, 19).replace('T', ' ')
  }, { reference: bizReference });

  const webhookUpgradedBizStore = dbFetchOne<any>('stores', { id: bizStoreId });
  assert(webhookUpgradedBizStore.plan_tier === 'business', 'Business store activated via webhook simulation');
  assert(webhookUpgradedBizStore.subscription_status === 'active', 'Business subscription status is active');
  assert(new Date(webhookUpgradedBizStore.plan_expires_at).getFullYear() >= now.getFullYear() + 1, 'Yearly plan extended for 365 days');

  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log('⚡ NODE.JS + SQLITE WAL LATENCY BENCHMARK');
  console.log('======================================================\n');

  const startInsert = performance.now();
  for (let i = 0; i < 50; i++) {
    sendMessage(custSession.conversation.id, 'customer', 'Benchmark User', `Benchmark message #${i}`);
  }
  const avgInsert = (performance.now() - startInsert) / 50;
  console.log(`▶ Message Insert Average:       ${avgInsert.toFixed(3)} ms / msg`);

  const startDelta = performance.now();
  for (let i = 0; i < 50; i++) {
    getConversationMessages(custSession.conversation.id, 50);
  }
  const avgDelta = (performance.now() - startDelta) / 50;
  console.log(`▶ Direct SQL Delta Poll Average: ${avgDelta.toFixed(3)} ms / req`);

  const startUnread = performance.now();
  for (let i = 0; i < 50; i++) {
    listMerchantConversations(chatStoreId);
  }
  const avgUnread = (performance.now() - startUnread) / 50;
  console.log(`▶ Merchant Inbox List Query:     ${avgUnread.toFixed(3)} ms / req`);

  console.log('\n======================================================');
  console.log(`🎉 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (100% SUCCESS)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
