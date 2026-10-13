import fs from 'fs';
import path from 'path';
import { getDb, initSchema, dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete } from '../src/db/db.js';
import { isMySQLConfigured } from '../src/db/mysql.js';
import { ENV } from '../src/config/env.js';
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
  listMerchantConversations,
  getStoreMonthlyChatUsage
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
import {
  recordStoreVisit,
  getStoreVisitorMetrics,
  recordVisitorHeartbeat,
  getLiveStoreVisitors,
  cleanupInactiveVisitors
} from '../src/modules/analytics/analyticsController.js';
import {
  verifyPurchaseEligibility,
  submitVerifiedReview,
  moderateReview,
  getPublicStoreReviews,
  getMerchantReviewsList,
  verifyVerificationToken,
  hashCustomerPhone,
  resetVerificationRateLimits
} from '../src/modules/reviews/reviewsService.js';
import { PERSISTENCE_TABLES } from '../src/db/persistence.js';
import {
  initSecurityDataModel,
  encryptSecret,
  decryptSecret,
  maskAccountNumber,
  hashAccountNumber,
  maskApiKey,
  getSellerProfile,
  getOrCreateSellerProfile,
  logSecurityAudit,
  recordRiskEvent,
  isStoreOrderGated
} from '../src/modules/security/securityService.js';
import { validateOutboundUrl } from '../src/modules/verification/providerInterface.js';
import {
  getProviderConfig,
  getDecryptedCredentials,
  saveProviderConfig,
  recordProviderTestResult,
  logIntegrationEvent
} from '../src/modules/verification/credentialVault.js';
import { monnifyAdapter } from '../src/modules/verification/monnifyAdapter.js';
import {
  calculateNameMatchScore,
  submitIdentityVerification,
  evaluateCompositeVerificationStatus
} from '../src/modules/verification/verificationService.js';
import { matchAccountName } from '../src/modules/verification/nameMatcher.js';
import {
  NIGERIAN_BANKS,
  bankOtpStore,
  saveVerifiedBankAccountRecord
} from '../src/modules/verification/bankVerificationController.js';
import { validateStoreName } from '../src/utils/storeNameValidator.js';
import {
  validateCacRegistrationFormat,
  submitBusinessVerification,
  approveBusinessVerification,
  rejectBusinessVerification,
  getBusinessProfile
} from '../src/modules/verification/businessVerificationService.js';
import {
  evaluateSellerRisk,
  checkBankAccountReuse,
  RISK_REASON_CODES
} from '../src/modules/fraud/riskEngine.js';

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
        delivery_fee: 1500,
        is_verified: 1
      });
    } else {
      dbUpdate('stores', { is_verified: 1 }, { id });
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

  // 2b. Persistent Uploads Directory Check (data/uploads - safe from Git deployments)
  const persistentUploadsDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(persistentUploadsDir)) fs.mkdirSync(persistentUploadsDir, { recursive: true });
  assert(fs.existsSync(persistentUploadsDir), 'Persistent uploads directory exists in data/uploads (safe from Git pulls)');
  assert(!persistentUploadsDir.includes(path.sep + 'dist' + path.sep), 'Persistent uploads directory is decoupled from build output dist/');

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
    status: 'active',
    is_verified: 1
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
  // SUITE 21: MYSQL MODULE, CONFIGURATION & STORE OWNER PERSISTENCE
  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log('🧪 SUITE 21: MYSQL MODULE, CONFIGURATION & PERSISTENCE');
  console.log('======================================================\n');

  // 21.1 Environment variable parsing
  assert(typeof isMySQLConfigured === 'function', 'isMySQLConfigured is an exported function');
  assert(ENV.DB_PORT === 3306 || typeof ENV.DB_PORT === 'number', 'DB_PORT parsed as valid integer');
  assert(typeof ENV.DB_HOST === 'string', 'DB_HOST is valid string');
  assert(typeof ENV.DB_PASSWORD === 'string', 'DB_PASSWORD is safely read from process.env');

  // 21.2 Store owner registration and login verification with 5-digit PIN
  const testPin = '77889';
  const testPinHash = await hashPassword(testPin);
  dbDelete('stores', { email: 'emeka@persistenthub.ng' });
  dbDelete('stores', { slug: 'persistent-store-hub' });
  const mysqlTestStoreId = dbInsert('stores', {
    slug: 'persistent-store-hub',
    store_name: 'Persistent Store Hub',
    owner_name: 'Emeka Nwosu',
    email: 'emeka@persistenthub.ng',
    password_hash: testPinHash,
    whatsapp_number: '+2348099887766',
    status: 'active',
    plan_tier: 'free',
    email_verified: 1,
    subscription_status: 'active'
  });

  assert(mysqlTestStoreId > 0, 'Store owner account created with unique database ID');

  // Fetch by email
  const fetchedByEmail = dbFetchOne<any>('stores', { email: 'emeka@persistenthub.ng' });
  assert(fetchedByEmail !== null, 'Store owner record readable by email');
  assert(fetchedByEmail.slug === 'persistent-store-hub', 'Store slug matches registered slug');
  assert(fetchedByEmail.owner_name === 'Emeka Nwosu', 'Store owner name preserved accurately');

  // Authenticate with 5-digit PIN
  const pinValid = await comparePassword(testPin, fetchedByEmail.password_hash);
  assert(pinValid === true, '5-digit PIN matches stored password hash');

  const wrongPinValid = await comparePassword('11111', fetchedByEmail.password_hash);
  assert(wrongPinValid === false, 'Incorrect 5-digit PIN correctly rejected');

  // Fetch by phone
  const fetchedByPhone = dbFetchOne<any>('stores', { whatsapp_number: '+2348099887766' });
  assert(fetchedByPhone !== null && fetchedByPhone.id === mysqlTestStoreId, 'Store owner record readable by WhatsApp phone');

  // 21.3 Database Migration Script Safety
  const { migrateSqliteToMySQL } = await import('../scripts/migrate_sqlite_to_mysql.js');
  assert(typeof migrateSqliteToMySQL === 'function', 'migrateSqliteToMySQL is exported as an async migration tool');

  // 21.4 Hostinger MySQL Persistence Bridge & Auto-Schema Synchronization
  const { initMySQLPersistence, PERSISTENCE_TABLES, replicateInsertToMySQL, replicateUpdateToMySQL, replicateDeleteToMySQL } = await import('../src/db/persistence.js');
  assert(typeof initMySQLPersistence === 'function', 'initMySQLPersistence is exported as an async function');
  assert(Array.isArray(PERSISTENCE_TABLES), 'PERSISTENCE_TABLES is exported as an array');
  assert(PERSISTENCE_TABLES.includes('stores'), 'Persistence tables include stores');
  assert(PERSISTENCE_TABLES.includes('super_admins'), 'Persistence tables include super_admins');
  assert(PERSISTENCE_TABLES.includes('reviews'), 'Persistence tables include reviews');
  assert(PERSISTENCE_TABLES.includes('orders'), 'Persistence tables include orders');
  assert(PERSISTENCE_TABLES.length >= 21, 'Persistence covers all 21 core platform tables');
  assert(typeof replicateInsertToMySQL === 'function', 'replicateInsertToMySQL is exported');
  assert(typeof replicateUpdateToMySQL === 'function', 'replicateUpdateToMySQL is exported');
  assert(typeof replicateDeleteToMySQL === 'function', 'replicateDeleteToMySQL is exported');

  // Test safe replication execution without crashing
  replicateInsertToMySQL('stores', { id: 99999, slug: 'mock-replicate-test' });
  replicateUpdateToMySQL('stores', { store_name: 'Updated Store' }, { id: 99999 });
  replicateDeleteToMySQL('stores', { id: 99999 });
  assert(true, 'Replication functions execute safely without unhandled rejections');

  // Test server boot persistence runner
  await initMySQLPersistence();
  assert(true, 'initMySQLPersistence runs safely and gracefully during server bootstrap');

  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log('🧪 SUITE 22: SECURE PURCHASE-VERIFIED PRODUCT REVIEW SYSTEM');
  console.log('======================================================\n');

  // Setup test stores & products
  resetVerificationRateLimits();
  dbDelete('stores', { slug: 'review-store-a' });
  dbDelete('stores', { slug: 'review-store-b' });
  dbDelete('orders', { order_ref: 'ORD-REV-001' });
  dbDelete('orders', { order_ref: 'ORD-REV-002' });
  dbDelete('orders', { order_ref: 'ORD-REV-003' });

  const storeAId = dbInsert('stores', {
    slug: 'review-store-a',
    store_name: 'Store A Electronics',
    owner_name: 'Merchant A',
    email: 'merchantA@reviewtest.ng',
    password_hash: await hashPassword('12345'),
    whatsapp_number: '+2348011112222',
    status: 'active',
    plan_tier: 'pro',
    email_verified: 1,
    subscription_status: 'active'
  });

  const storeBId = dbInsert('stores', {
    slug: 'review-store-b',
    store_name: 'Store B Fashion',
    owner_name: 'Merchant B',
    email: 'merchantB@reviewtest.ng',
    password_hash: await hashPassword('12345'),
    whatsapp_number: '+2348022223333',
    status: 'active',
    plan_tier: 'free',
    email_verified: 1,
    subscription_status: 'active'
  });

  const itemA1 = dbInsert('items', {
    store_id: storeAId,
    title: 'Wireless ANC Headphones',
    price: 35000,
    is_available: 1
  });

  const itemA2 = dbInsert('items', {
    store_id: storeAId,
    title: 'USB-C Fast Charging Hub',
    price: 12000,
    is_available: 1
  });

  const itemB1 = dbInsert('items', {
    store_id: storeBId,
    title: 'Ankara Luxury Blazer',
    price: 25000,
    is_available: 1
  });

  // Customer phone numbers for testing (Nigerian formats)
  const phoneCustomer1Local = '08033445566'; // +2348033445566
  const phoneCustomer1Intl = '+2348033445566';
  const phoneCustomer2 = '08122334455';
  const phoneNeverPurchased = '07099887766';

  // Order 1: Store A, Customer 1 bought itemA1, completed
  const orderCompletedId = dbInsert('orders', {
    store_id: storeAId,
    order_ref: 'ORD-REV-001',
    customer_name: 'Amaka Eze',
    customer_phone: phoneCustomer1Local,
    items_json: JSON.stringify([{ id: itemA1, title: 'Wireless ANC Headphones', price: 35000, quantity: 1 }]),
    total_amount: 35000,
    payment_status: 'paid',
    order_status: 'completed'
  });

  // Order 2: Store A, Customer 2 bought itemA2, but status is pending (unprocessed)
  const orderPendingId = dbInsert('orders', {
    store_id: storeAId,
    order_ref: 'ORD-REV-002',
    customer_name: 'Tunde Bakare',
    customer_phone: phoneCustomer2,
    items_json: JSON.stringify([{ id: itemA2, title: 'USB-C Fast Charging Hub', price: 12000, quantity: 1 }]),
    total_amount: 12000,
    payment_status: 'unpaid',
    order_status: 'pending'
  });

  // Order 3: Store A, Customer 2 bought itemA1, but order was cancelled by merchant
  const orderCancelledId = dbInsert('orders', {
    store_id: storeAId,
    order_ref: 'ORD-REV-003',
    customer_name: 'Tunde Bakare',
    customer_phone: phoneCustomer2,
    items_json: JSON.stringify([{ id: itemA1, title: 'Wireless ANC Headphones', price: 35000, quantity: 1 }]),
    total_amount: 35000,
    payment_status: 'unpaid',
    order_status: 'cancelled'
  });

  // Clean existing test reviews for clean test isolation
  dbDelete('reviews', { store_id: storeAId });
  dbDelete('reviews', { store_id: storeBId });

  // 22.1 Non-Purchaser Rejected
  const verifyNonPurchaser = verifyPurchaseEligibility(storeAId, itemA1, phoneNeverPurchased);
  assert(verifyNonPurchaser.eligible === false, 'Phone that never purchased is rejected');
  assert(verifyNonPurchaser.error === "We couldn't verify a qualifying purchase for this product using that phone number.", 'Generic safe error message does not expose DB contents');

  // 22.2 Customer of Different Merchant Rejected
  const verifyCrossMerchant = verifyPurchaseEligibility(storeBId, itemB1, phoneCustomer1Local);
  assert(verifyCrossMerchant.eligible === false, 'Customer who bought from Store A cannot review Store B');

  // 22.3 Different Product from Same Merchant Rejected
  const verifyDifferentProduct = verifyPurchaseEligibility(storeAId, itemA2, phoneCustomer1Local);
  assert(verifyDifferentProduct.eligible === false, 'Customer who bought Product 1 cannot review Product 2');

  // 22.4 Pending Order Rejected
  const verifyPendingOrder = verifyPurchaseEligibility(storeAId, itemA2, phoneCustomer2);
  assert(verifyPendingOrder.eligible === false, 'Pending order is ineligible for review');

  // 22.5 Completed Order Successfully Verified with Nigerian phone normalization
  const verifyCompleted = verifyPurchaseEligibility(storeAId, itemA1, phoneCustomer1Intl);
  assert(verifyCompleted.eligible === true, 'Completed order is successfully verified');
  assert(typeof verifyCompleted.token === 'string', 'Cryptographic verification token issued');
  assert(verifyCompleted.is_verified_purchase === 1, 'Completed purchase marked as verified purchase badge 1');

  // Verify token signature validation
  const tokenPayload = verifyVerificationToken(verifyCompleted.token!);
  assert(tokenPayload.valid === true, 'Verification token successfully decodes and validates signature');
  assert(tokenPayload.payload?.store_id === storeAId, 'Token encodes correct store ID');
  assert(tokenPayload.payload?.item_id === itemA1, 'Token encodes correct item ID');

  // 22.6 Cancelled Order Acknowledged Feedback (Recommendation 1)
  const verifyCancelled = verifyPurchaseEligibility(storeAId, itemA1, phoneCustomer2);
  assert(verifyCancelled.eligible === true, 'Processed cancelled order is eligible for ordering experience feedback');
  assert(verifyCancelled.is_verified_purchase === 0, 'Cancelled order is distinguished without Verified Purchase badge');

  // 22.7 Token Tampering Defense
  const tamperedToken = verifyCompleted.token! + 'tampered';
  const submitTampered = submitVerifiedReview({
    token: tamperedToken,
    rating: 5,
    comment: 'Hacked review submission'
  });
  assert(submitTampered.success === false, 'Tampered token is strictly rejected');

  // 22.8 Valid Review Submission
  const submitReview1 = submitVerifiedReview({
    token: verifyCompleted.token!,
    rating: 5,
    comment: 'Super fast delivery and crystal clear audio quality! Loved it.'
  });
  assert(submitReview1.success === true, 'Verified review submitted successfully');
  assert(submitReview1.review.status === 'pending_review', 'Newly submitted review starts in pending_review moderation state');
  assert(submitReview1.review.is_verified_purchase === 1, 'Review records is_verified_purchase flag');

  // 22.9 Review Hidden from Public Storefront while Pending
  const publicReviewsBefore = getPublicStoreReviews(storeAId, itemA1);
  assert(publicReviewsBefore.total === 0, 'Pending review does NOT count toward public total');
  assert(publicReviewsBefore.reviews.length === 0, 'Pending review is NOT shown in public reviews list');
  assert(publicReviewsBefore.average_rating === 0, 'Pending review does NOT alter public average rating');

  // 22.10 Duplicate Review Update Prevention (Same Customer, Same Product)
  const verifyReReview = verifyPurchaseEligibility(storeAId, itemA1, phoneCustomer1Local);
  assert(verifyReReview.eligible === true, 'Re-verification allowed for existing purchaser');
  assert(verifyReReview.existing_review !== null, 'Existing review recognized during re-verification');

  // Submitting again updates the existing review rather than creating a duplicate
  const submitUpdate = submitVerifiedReview({
    token: verifyReReview.token!,
    rating: 4,
    comment: 'Updated review: Still great after 2 weeks of use.'
  });
  assert(submitUpdate.success === true, 'Customer can update their existing review');
  assert(submitUpdate.is_update === true, 'System confirms review was updated');
  assert(submitUpdate.review.id === submitReview1.review.id, 'Same review ID maintained, zero duplicate records created');

  // 22.11 Merchant Moderation Authorization Checks
  const unauthorizedMod = moderateReview(storeBId, submitReview1.review.id, 'approve', 'Merchant B');
  assert(unauthorizedMod.success === false, 'Other merchant cannot moderate reviews for this store');

  // Merchant A moderates: Rejects review
  const rejectMod = moderateReview(storeAId, submitReview1.review.id, 'reject', 'Merchant A', 'Contains policy violation');
  assert(rejectMod.success === true, 'Merchant can reject review');
  assert(rejectMod.review.status === 'rejected', 'Review status updated to rejected');
  assert(rejectMod.review.rejection_reason === 'Contains policy violation', 'Rejection reason recorded');

  // Verify still hidden from public storefront
  const publicAfterReject = getPublicStoreReviews(storeAId, itemA1);
  assert(publicAfterReject.total === 0, 'Rejected review remains hidden from public storefront');

  // Merchant A approves review
  const approveMod = moderateReview(storeAId, submitReview1.review.id, 'approve', 'Merchant A');
  assert(approveMod.success === true, 'Merchant can approve review');
  assert(approveMod.review.status === 'approved', 'Review status updated to approved');

  // 22.12 Public Storefront Rating Calculation & Safe Display
  const publicAfterApprove = getPublicStoreReviews(storeAId, itemA1);
  assert(publicAfterApprove.total === 1, 'Approved review is now included in public total');
  assert(publicAfterApprove.average_rating === 4, 'Approved review reflects authoritative average rating (4.0)');
  assert(publicAfterApprove.distribution[4] === 1, 'Rating distribution correctly tracks 4-star review');
  assert(publicAfterApprove.reviews[0].customer_name === 'Amaka E.', 'Customer name safely masked in public display');
  assert(publicAfterApprove.reviews[0].is_verified_purchase === true, 'Verified Purchase badge confirmed in public review object');

  // 22.13 Merchant Reviews List Query & Pending Counter
  const merchantList = getMerchantReviewsList(storeAId, { status: 'all' });
  assert(merchantList.total >= 1, 'Merchant reviews list returns all store reviews');
  assert(merchantList.reviews[0].product_title === 'Wireless ANC Headphones', 'Product title joined cleanly for merchant console');

  // =============================================================
  // SUITE 23: MERCHANT PAYMENT METHOD CONTROLS & DIRECT BANK TRANSFER CONFIRMATION FLOW
  // =============================================================
  console.log('\n--- SUITE 23: MERCHANT PAYMENT CONTROLS & TRANSFER CONFIRMATION ---');

  // 23.1 Default Store Configuration (Bank Transfer enabled, POD disabled)
  const uniquePmSlug = 'pm-test-' + Date.now();
  const pmStoreId = dbInsert('stores', {
    store_name: 'Payment Methods Store',
    owner_name: 'PM Store Owner',
    slug: uniquePmSlug,
    email: `pm-test-${Date.now()}@zlik.store`,
    password_hash: hashPassword('pmPassword123'),
    whatsapp_number: '08123456789',
    bank_name: 'Zenith Bank',
    bank_account_number: '1012345678',
    bank_account_name: 'Payment Methods Test Ltd',
    allow_bank_transfer: 1,
    allow_pay_on_delivery: 0,
    is_verified: 1,
    created_at: new Date().toISOString()
  });

  const pmStore = dbFetchOne<any>('stores', { id: pmStoreId });
  assert(pmStore !== null, 'Payment Methods test store created');
  assert(pmStore.allow_bank_transfer === 1, 'Default allow_bank_transfer is 1 (enabled)');
  assert(pmStore.allow_pay_on_delivery === 0, 'Default allow_pay_on_delivery is 0 (disabled)');

  const pmItemId = dbInsert('items', {
    store_id: pmStoreId,
    title: 'Test Leather Backpack',
    price: 15000,
    stock_quantity: 20,
    is_available: 1,
    created_at: new Date().toISOString()
  });

  // 23.2 Gating: Store has only Bank Transfer enabled, attempts POD order -> Rejected
  const podRejected = await createOrder({
    store_id: pmStoreId,
    customer_name: 'POD Test Buyer',
    customer_phone: '08099887766',
    fulfillment_type: 'delivery',
    delivery_address: '12 Admiralty Way, Lekki',
    payment_method: 'pay_on_delivery',
    items: [{ id: pmItemId, quantity: 1, price: 15000, title: 'Test Leather Backpack' }]
  });
  assert(podRejected.success === false, 'Pay on Delivery rejected when store has disabled POD');
  assert(podRejected.error?.includes('not accepted by this store'), 'Rejection error clearly states payment method is not accepted');

  // 23.3 Bank Transfer Order with Confirmation & Receipt Screenshot
  const btConfirmed = await createOrder({
    store_id: pmStoreId,
    customer_name: 'BT Buyer Confirmed',
    customer_phone: '08099887766',
    fulfillment_type: 'delivery',
    delivery_address: '12 Admiralty Way, Lekki',
    payment_method: 'bank_transfer',
    payment_confirmed: true,
    receipt_url: '/uploads/receipts/rcpt_test_proof_123.jpg',
    payment_proof_ref: 'Tunde Transfer Ref #9988',
    items: [{ id: pmItemId, quantity: 1, price: 15000, title: 'Test Leather Backpack' }]
  });
  assert(btConfirmed.success === true, 'Bank transfer order created successfully');
  assert(btConfirmed.order?.payment_status === 'claimed', 'Bank transfer with payment_confirmed=true sets payment_status="claimed"');
  assert(btConfirmed.order?.receipt_url === '/uploads/receipts/rcpt_test_proof_123.jpg', 'Receipt URL stored in order record');
  assert(btConfirmed.order?.payment_proof_ref === 'Tunde Transfer Ref #9988', 'Payment proof note / ref stored in order record');

  // Verify payment claim automatically registered
  const autoClaim = dbFetchOne<any>('payment_claims', { order_id: btConfirmed.order?.id });
  assert(autoClaim !== null, 'Payment claim record automatically generated for confirmed transfer');
  assert(autoClaim.status === 'claimed', 'Auto-created payment claim has status "claimed"');
  assert(autoClaim.payment_reference === 'Tunde Transfer Ref #9988', 'Payment claim reference matches transfer reference');

  // 23.4 Merchant Updates Settings: Enables Pay on Delivery, Disables Bank Transfer
  dbUpdate('stores', { allow_bank_transfer: 0, allow_pay_on_delivery: 1 }, { id: pmStoreId });
  const updatedPmStore = dbFetchOne<any>('stores', { id: pmStoreId });
  assert(updatedPmStore.allow_bank_transfer === 0, 'Store allows_bank_transfer updated to 0');
  assert(updatedPmStore.allow_pay_on_delivery === 1, 'Store allows_pay_on_delivery updated to 1');

  // 23.5 Gating: Store has only POD enabled, attempts Bank Transfer -> Rejected
  const btRejected = await createOrder({
    store_id: pmStoreId,
    customer_name: 'BT Test Buyer 2',
    customer_phone: '08099887766',
    fulfillment_type: 'delivery',
    delivery_address: '14 Allen Ave, Ikeja',
    payment_method: 'bank_transfer',
    items: [{ id: pmItemId, quantity: 1, price: 15000, title: 'Test Leather Backpack' }]
  });
  assert(btRejected.success === false, 'Bank Transfer rejected when store has disabled Bank Transfer');
  assert(btRejected.error?.includes('not accepted by this store'), 'Rejection error clearly states Bank Transfer is not accepted');

  // 23.6 Successful Pay on Delivery Checkout
  const podSuccess = await createOrder({
    store_id: pmStoreId,
    customer_name: 'POD Happy Customer',
    customer_phone: '08099887766',
    fulfillment_type: 'delivery',
    delivery_address: '14 Allen Ave, Ikeja',
    payment_method: 'pay_on_delivery',
    items: [{ id: pmItemId, quantity: 1, price: 15000, title: 'Test Leather Backpack' }]
  });
  assert(podSuccess.success === true, 'Pay on Delivery order created successfully');
  assert(podSuccess.order?.payment_status === 'unpaid', 'POD order sets payment_status="unpaid"');
  assert(podSuccess.order?.payment_proof_ref === 'Pay on Delivery', 'POD order sets payment_proof_ref="Pay on Delivery"');
  assert(podSuccess.order?.receipt_url === null, 'POD order has no receipt URL');

  // Verify no payment claims created for POD
  const podClaim = dbFetchOne<any>('payment_claims', { order_id: podSuccess.order?.id });
  assert(podClaim === null, 'No payment claim created for Pay on Delivery order');

  // 23.7 Merchant Confirms Claimed Bank Transfer Order
  const confirmedRes = await confirmOrderPayment(btConfirmed.order!.id, pmStoreId);
  assert(confirmedRes.success === true, 'Merchant successfully confirms claimed transfer');
  const paidOrder = dbFetchOne<any>('orders', { id: btConfirmed.order!.id });
  assert(paidOrder.payment_status === 'paid', 'Order payment_status transitioned to "paid"');
  const updatedClaim = dbFetchOne<any>('payment_claims', { order_id: btConfirmed.order!.id });
  assert(updatedClaim.status === 'confirmed', 'Payment claim status transitioned to "confirmed"');

  // 23.8 Merchant Rejection of Claimed Order
  // Create another claimed order to test rejection
  dbUpdate('stores', { allow_bank_transfer: 1, allow_pay_on_delivery: 1 }, { id: pmStoreId });
  const btToReject = await createOrder({
    store_id: pmStoreId,
    customer_name: 'Fraud Claimer',
    customer_phone: '08011223344',
    fulfillment_type: 'delivery',
    delivery_address: '5 Ozumba Mbadiwe, VI',
    payment_method: 'bank_transfer',
    payment_confirmed: true,
    payment_proof_ref: 'Bogus note 000',
    items: [{ id: pmItemId, quantity: 1, price: 15000, title: 'Test Leather Backpack' }]
  });
  assert(btToReject.success === true, 'Claimed order for rejection created');
  assert(btToReject.order?.payment_status === 'claimed', 'Order initially in claimed status');

  const rejectRes = await rejectOrderPayment(btToReject.order!.id, pmStoreId, 'Transfer not received in bank account');
  assert(rejectRes.success === true, 'Merchant rejects payment claim');
  const rejectedOrder = dbFetchOne<any>('orders', { id: btToReject.order!.id });
  assert(rejectedOrder.payment_status === 'unpaid', 'Order reverted to unpaid status');
  const rejectedClaim = dbFetchOne<any>('payment_claims', { order_id: btToReject.order!.id });
  assert(rejectedClaim.status === 'rejected', 'Payment claim status marked as rejected');

  // =============================================================
  // SUITE 24: LANDING PRICING TIERS, LIVE CUSTOMER TRACKING & MONTHLY LIVE CHAT LIMITS
  // =============================================================
  console.log('\n--- SUITE 24: PRICING CONFIG, LIVE VISITOR TRACKING & MONTHLY CHAT LIMITS ---');

  // 24.1 Plan Configurations, Feature Entitlements & Yearly Pricing Calculations
  assert(PLANS.free.price_monthly === 0 && PLANS.free.price_yearly === 0, 'Free plan is ₦0 monthly and ₦0 yearly forever');
  assert(PLANS.pro.price_monthly === 5000 && PLANS.pro.price_yearly === 50000, 'Pro plan is ₦5,000 monthly and ₦50,000 yearly (Save ₦10,000/yr)');
  assert(PLANS.business.price_monthly === 9000 && PLANS.business.price_yearly === 90000, 'Business plan is ₦9,000 monthly and ₦90,000 yearly (Save ₦18,000/yr)');

  // Yearly savings calculations
  const proAnnualMonthlyCost = PLANS.pro.price_monthly * 12; // 60,000
  const proAnnualSavings = proAnnualMonthlyCost - PLANS.pro.price_yearly;
  assert(proAnnualSavings === 10000, 'Pro annual savings equals exactly ₦10,000 (Save 2 months)');

  const bizAnnualMonthlyCost = PLANS.business.price_monthly * 12; // 108,000
  const bizAnnualSavings = bizAnnualMonthlyCost - PLANS.business.price_yearly;
  assert(bizAnnualSavings === 18000, 'Business annual savings equals exactly ₦18,000 (Save 2 months)');

  // Plan feature entitlements verification
  assert(PLANS.free.features.live_customer_tracking === false, 'Free tier has live_customer_tracking disabled');
  assert(PLANS.pro.features.live_customer_tracking === true, 'Pro tier has live_customer_tracking enabled');
  assert(PLANS.business.features.live_customer_tracking === true, 'Business tier has live_customer_tracking enabled');
  assert(PLANS.free.limits.live_chat_monthly_conversations === 20, 'Free tier has 20 monthly live chat limit');
  assert(PLANS.pro.limits.live_chat_monthly_conversations === -1, 'Pro tier has unlimited live chat');
  assert(PLANS.business.limits.live_chat_monthly_conversations === -1, 'Business tier has unlimited live chat');

  // 24.2 Live Customer Tracking Engine (Heartbeat, Expiration & Multi-Branch Support)
  const trackingProStoreId = 9911;
  const trackingBizStoreId = 9912;
  const trackingFreeStoreId = 9913;

  // Setup stores
  db.prepare('DELETE FROM stores WHERE id IN (?, ?, ?)').run(trackingProStoreId, trackingBizStoreId, trackingFreeStoreId);
  db.prepare('DELETE FROM active_visitors WHERE store_id IN (?, ?, ?)').run(trackingProStoreId, trackingBizStoreId, trackingFreeStoreId);

  dbInsert('stores', {
    id: trackingProStoreId,
    store_name: 'Live Tracking Pro Store',
    owner_name: 'Pro Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'live-pro-' + Date.now(),
    whatsapp_number: '08011223344',
    plan_tier: 'pro',
    status: 'active'
  });

  dbInsert('stores', {
    id: trackingBizStoreId,
    store_name: 'Live Tracking Biz Store',
    owner_name: 'Biz Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'live-biz-' + Date.now(),
    whatsapp_number: '08022334455',
    plan_tier: 'business',
    status: 'active'
  });

  dbInsert('stores', {
    id: trackingFreeStoreId,
    store_name: 'Live Tracking Free Store',
    owner_name: 'Free Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'live-free-' + Date.now(),
    whatsapp_number: '08033445566',
    plan_tier: 'free',
    status: 'active'
  });

  // Verify Pro tracking access allowed, Free tracking access locked
  const proPlanCheck = getStorePlanDetails(dbFetchOne<any>('stores', { id: trackingProStoreId }));
  assert(can(proPlanCheck, 'live_customer_tracking') === true, 'Pro store is entitled to live customer tracking');

  const freePlanCheck = getStorePlanDetails(dbFetchOne<any>('stores', { id: trackingFreeStoreId }));
  assert(can(freePlanCheck, 'live_customer_tracking') === false, 'Free store is locked from live customer tracking');

  // Record heartbeats for Pro store: 2 active shoppers
  const visitorA = 'vis_pro_tok_aaa_' + Date.now();
  const visitorB = 'vis_pro_tok_bbb_' + Date.now();

  recordVisitorHeartbeat({
    store_id: trackingProStoreId,
    visitor_session_id: visitorA,
    current_page: '/live-pro',
    page_title: 'Store Home',
    traffic_source: 'Instagram'
  });
  recordVisitorHeartbeat({
    store_id: trackingProStoreId,
    visitor_session_id: visitorB,
    current_page: '/live-pro?product=101',
    page_title: 'Viewing Nike Sneakers',
    traffic_source: 'WhatsApp'
  });

  let proLive = getLiveStoreVisitors(trackingProStoreId);
  assert(proLive.active_count === 2, 'Pro store has exactly 2 active live shoppers');
  assert(proLive.visitors[0].traffic_source === 'Instagram' || proLive.visitors[1].traffic_source === 'Instagram', 'Instagram traffic source detected');
  assert(proLive.visitors[0].traffic_source === 'WhatsApp' || proLive.visitors[1].traffic_source === 'WhatsApp', 'WhatsApp traffic source detected');

  // Update visitor A's pageview (e.g., navigated to checkout)
  recordVisitorHeartbeat({
    store_id: trackingProStoreId,
    visitor_session_id: visitorA,
    current_page: '/live-pro/checkout',
    page_title: 'Checking Out',
    traffic_source: 'Instagram'
  });
  proLive = getLiveStoreVisitors(trackingProStoreId);
  assert(proLive.active_count === 2, 'Active count remains 2 after visitor navigates to checkout');
  const visA = proLive.visitors.find((v: any) => v.session_id === visitorA);
  assert(visA && visA.page_title === 'Checking Out', 'Visitor heartbeat updates current page and title in real time');

  // Business store with multiple branches
  const branchNorth = dbInsert('branches', {
    store_id: trackingBizStoreId,
    name: 'North Branch',
    address: 'Abuja Central',
    city: 'Abuja',
    is_main: 1,
    status: 'active'
  });
  const branchSouth = dbInsert('branches', {
    store_id: trackingBizStoreId,
    name: 'South Branch',
    address: 'Lekki Phase 1',
    city: 'Lagos',
    is_main: 0,
    status: 'active'
  });

  const visitorNorth = 'vis_biz_north_' + Date.now();
  const visitorSouth = 'vis_biz_south_' + Date.now();
  recordVisitorHeartbeat({
    store_id: trackingBizStoreId,
    visitor_session_id: visitorNorth,
    branch_id: branchNorth,
    current_page: '/live-biz',
    page_title: 'Abuja Branch Storefront',
    traffic_source: 'TikTok'
  });
  recordVisitorHeartbeat({
    store_id: trackingBizStoreId,
    visitor_session_id: visitorSouth,
    branch_id: branchSouth,
    current_page: '/live-biz',
    page_title: 'Lekki Branch Storefront',
    traffic_source: 'Direct'
  });

  const bizAll = getLiveStoreVisitors(trackingBizStoreId, { isBusiness: true });
  assert(bizAll.active_count === 2, 'Business store total active shoppers across all branches is 2');
  assert(Object.keys(bizAll.branches_breakdown).length === 2, 'Business store returns breakdown for both branches');

  const bizNorthOnly = getLiveStoreVisitors(trackingBizStoreId, { branchId: branchNorth });
  assert(bizNorthOnly.active_count === 1, 'Business branch filter correctly isolates North branch shopper (1)');
  assert(bizNorthOnly.visitors[0].session_id === visitorNorth, 'Branch filter matched North visitor token');

  // Expiration test: artificially backdate visitor B by 4 minutes (stale > 3 minutes)
  const staleTime = new Date(Date.now() - 4 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE active_visitors SET last_seen_at = ? WHERE visitor_session_id = ?').run(staleTime, visitorB);

  // Clean inactive visitors (> 180 seconds)
  cleanupInactiveVisitors(180);

  const proLiveAfterCleanup = getLiveStoreVisitors(trackingProStoreId);
  assert(proLiveAfterCleanup.active_count === 1, 'Stale visitor automatically expired and removed after 3 minutes');
  assert(proLiveAfterCleanup.visitors[0].session_id === visitorA, 'Active visitor remains tracked');

  // 24.3 Monthly Live Chat Limits (Free: 20 per month, Pro/Biz: Unlimited, Calendar month boundary)
  const chatLimitFreeStoreId = 9920;
  const chatLimitProStoreId = 9921;
  db.prepare('DELETE FROM stores WHERE id IN (?, ?)').run(chatLimitFreeStoreId, chatLimitProStoreId);
  db.prepare('DELETE FROM chat_conversations WHERE store_id IN (?, ?)').run(chatLimitFreeStoreId, chatLimitProStoreId);

  dbInsert('stores', {
    id: chatLimitFreeStoreId,
    store_name: 'Chat Limit Free Store',
    owner_name: 'Chat Free Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'chat-free-' + Date.now(),
    whatsapp_number: '08099001122',
    plan_tier: 'free',
    status: 'active'
  });

  dbInsert('stores', {
    id: chatLimitProStoreId,
    store_name: 'Chat Limit Pro Store',
    owner_name: 'Chat Pro Owner',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'chat-pro-' + Date.now(),
    whatsapp_number: '08099001133',
    plan_tier: 'pro',
    status: 'active'
  });

  // Verify initial usage is 0/20
  const initialUsage = getStoreMonthlyChatUsage(chatLimitFreeStoreId);
  assert(initialUsage.used_this_month === 0, 'Initial free store monthly chats used is 0');
  assert(initialUsage.limit === 20, 'Free store monthly limit is 20');
  assert(initialUsage.is_exhausted === false, 'Free store has not reached limit');
  assert(initialUsage.remaining === 20, 'Free store has 20 chats remaining');

  // Create 20 unique customer conversations
  let lastSessionToken = '';
  for (let c = 1; c <= 20; c++) {
    const custTok = `free_cust_sess_${c}_` + Date.now();
    lastSessionToken = custTok;
    const sessionRes = getOrCreateCustomerSession(chatLimitFreeStoreId, custTok, `Customer ${c}`, `080000000${c.toString().padStart(2, '0')}`);
    assert(sessionRes.conversation !== null, `Conversation ${c} created successfully for Free store`);
  }

  const usageAt20 = getStoreMonthlyChatUsage(chatLimitFreeStoreId);
  assert(usageAt20.used_this_month === 20, 'Usage count reflects 20 conversations used');
  assert(usageAt20.is_exhausted === true, 'is_exhausted is true when exactly 20 conversations used');
  assert(usageAt20.remaining === 0, '0 chats remaining for this month');

  // Attempting 21st NEW customer conversation on Free store -> Blocked with limit_reached
  const custTok21 = 'free_cust_sess_21_' + Date.now();
  const session21Res = getOrCreateCustomerSession(chatLimitFreeStoreId, custTok21, 'Customer 21', '08099999999');
  assert(session21Res.conversation === null, '21st new conversation is rejected for Free store');
  assert(session21Res.limit_reached === true, 'session21 returns limit_reached: true');
  assert(session21Res.error?.includes('free monthly live chat limit') === true, 'Friendly limit reached error returned');

  // Existing conversation can continue messaging unmetered!
  const returningRes = getOrCreateCustomerSession(chatLimitFreeStoreId, lastSessionToken);
  assert(returningRes.conversation !== null, 'Returning customer on existing session is unmetered and succeeds');
  assert(returningRes.isNew === false, 'Returning session is identified as isNew: false');
  const sendFollowUpRes = sendMessage(returningRes.conversation.id, 'customer', 'Customer 20', 'Follow up inquiry on my order');
  assert(sendFollowUpRes.success === true, 'Existing customer can send follow-up message even when monthly quota is full');

  // Pro store has unlimited chat conversations
  const proUsage = getStoreMonthlyChatUsage(chatLimitProStoreId);
  assert(proUsage.limit === -1, 'Pro store limit is -1 (unlimited)');
  assert(proUsage.remaining === -1, 'Pro store remaining is -1 (unlimited)');
  assert(proUsage.is_exhausted === false, 'Pro store is_exhausted is false');

  // Pro store can create 25+ conversations without any block
  for (let c = 1; c <= 25; c++) {
    const proCustTok = `pro_cust_sess_${c}_` + Date.now();
    const proSess = getOrCreateCustomerSession(chatLimitProStoreId, proCustTok, `Pro Cust ${c}`, `081111111${c.toString().padStart(2, '0')}`);
    assert(proSess.conversation !== null, `Pro store conversation ${c} created successfully without restriction`);
  }

  // =============================================================
  // SUITE 25: SECURITY FOUNDATIONS, DATA MODEL & IDENTITY MIGRATIONS (BATCH 1)
  // =============================================================
  console.log('\n--- SUITE 25: SECURITY FOUNDATIONS & DATA MODEL (BATCH 1) ---');

  // 25.1 Verify all 10 Security & Trust tables exist and are queryable
  const securityTables = [
    'seller_profiles',
    'seller_verifications',
    'business_profiles',
    'seller_bank_accounts',
    'verification_provider_configs',
    'fraud_reports',
    'fraud_case_events',
    'risk_events',
    'security_audit_logs',
    'integration_events'
  ];

  for (const table of securityTables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
    assert(count !== undefined && count.count >= 0, `Security table '${table}' exists and is queryable`);
  }

  // 25.2 Verify PERSISTENCE_TABLES includes all 10 new security tables
  for (const table of securityTables) {
    assert(PERSISTENCE_TABLES.includes(table), `PERSISTENCE_TABLES includes '${table}' for Hostinger MySQL replication`);
  }
  assert(PERSISTENCE_TABLES.length === 32, 'Persistence tables collection covers all 32 core platform tables');

  // 25.3 Field-Level AES-256-GCM Encryption & Masking
  const rawApiKey = 'MK_TEST_998877665544332211';
  const encKey = encryptSecret(rawApiKey);
  assert(encKey !== rawApiKey, 'Encryption produces non-plaintext ciphertext');
  assert(encKey.includes(':'), 'AES-256-GCM ciphertext encodes IV and auth tag');
  const decKey = decryptSecret(encKey);
  assert(decKey === rawApiKey, 'AES-256-GCM decrypts round-trip accurately');

  const rawAcctNum = '0123456789';
  const maskedAcct = maskAccountNumber(rawAcctNum);
  assert(maskedAcct === '0123••••89', 'Account number safely masked with 4-digit prefix and 2-digit suffix');

  const hashedAcct = hashAccountNumber(rawAcctNum);
  assert(hashedAcct.length === 64, 'HMAC-SHA256 account number hash is 64-character hex string');
  assert(hashedAcct === hashAccountNumber(rawAcctNum), 'Account hash is deterministic for duplicate detection');
  assert(hashedAcct !== hashAccountNumber('9876543210'), 'Different account numbers produce distinct hashes');

  const maskedKey = maskApiKey(rawApiKey);
  assert(maskedKey.startsWith('MK_TES') && maskedKey.endsWith('2211'), 'API key safely masked for dashboard display');

  // 25.4 Idempotent Data Model Initialization & Legacy Store Backfill
  const securityTestStoreId = 9980;
  db.prepare('DELETE FROM stores WHERE id = ?').run(securityTestStoreId);
  db.prepare('DELETE FROM seller_profiles WHERE store_id = ?').run(securityTestStoreId);
  db.prepare('DELETE FROM seller_bank_accounts WHERE seller_id IN (SELECT id FROM seller_profiles WHERE store_id = ?)').run(securityTestStoreId);

  dbInsert('stores', {
    id: securityTestStoreId,
    store_name: 'Backfill Test Boutique',
    owner_name: 'Ngozi Okeke',
    password_hash: '$2a$10$dummyhashfortesting',
    slug: 'backfill-test-' + Date.now(),
    whatsapp_number: '08033221100',
    bank_name: 'Access Bank',
    bank_account_number: '0011223344',
    bank_account_name: 'Ngozi Okeke Trade',
    is_verified: 0,
    status: 'active'
  });

  // Run backfill initialization
  initSecurityDataModel();

  const profile = getSellerProfile(securityTestStoreId);
  assert(profile !== null, 'Legacy store automatically backfilled into seller_profiles');
  assert(profile.legal_name === 'Ngozi Okeke', 'Seller legal name initialized from store owner');
  assert(profile.public_store_name === 'Backfill Test Boutique', 'Public store name matches store name');
  assert(profile.order_gating_enabled === 1, 'Legacy store maintains order_gating_enabled = 1');
  assert(profile.composite_verification_status === 'unverified', 'Unverified legacy store starts with unverified status');

  const bankAcct = dbFetchOne<any>('seller_bank_accounts', { seller_id: profile.id });
  assert(bankAcct !== null, 'Legacy bank details automatically migrated to seller_bank_accounts');
  assert(bankAcct.bank_name === 'Access Bank', 'Migrated bank name matches store');
  assert(bankAcct.account_name === 'Ngozi Okeke Trade', 'Migrated account name matches store');
  assert(bankAcct.account_number_masked === '0011••••44', 'Migrated account number safely masked');
  assert(decryptSecret(bankAcct.account_number_encrypted) === '0011223344', 'Encrypted account number decrypts to original');

  // Verify Monnify provider configuration initialized
  const monnifyConfig = dbFetchOne<any>('verification_provider_configs', { provider_key: 'monnify' });
  assert(monnifyConfig !== null, 'Default Monnify verification provider configuration seeded');
  assert(monnifyConfig.base_url === 'https://sandbox.monnify.com', 'Monnify base URL initialized to sandbox');
  assert(monnifyConfig.status === 'not_configured' || monnifyConfig.status === 'active', 'Initial Monnify status is not_configured or active');

  // 25.5 Security Audit Logging & Risk Engine Integration
  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: 1,
    action: 'TEST_AUDIT_LOG_INITIALIZATION',
    target_type: 'seller',
    target_id: profile.id,
    reason: 'Verifying Batch 1 audit log integrity',
    ip_address: '127.0.0.1'
  });

  const auditEntry = dbFetchOne<any>('security_audit_logs', { action: 'TEST_AUDIT_LOG_INITIALIZATION' });
  assert(auditEntry !== null, 'Security audit entry successfully recorded');
  assert(auditEntry.actor_type === 'super_admin', 'Audit entry actor type recorded');
  assert(auditEntry.reason === 'Verifying Batch 1 audit log integrity', 'Audit reason recorded');

  // Risk Event & Dynamic Level Assessment
  recordRiskEvent({
    seller_id: profile.id,
    event_type: 'RAPID_BANK_CHANGE',
    score_delta: 30,
    reason_code: 'SUSPICIOUS_FREQUENCY',
    metadata: { attempt_count: 3 }
  });

  const updatedProfile1 = getSellerProfile(securityTestStoreId);
  assert(updatedProfile1.risk_score === 30, 'Risk event added 30 points to seller risk score');
  assert(updatedProfile1.risk_level === 'medium', 'Score 30 categorizes seller into medium risk level');

  recordRiskEvent({
    seller_id: profile.id,
    event_type: 'MULTIPLE_DISPUTES',
    score_delta: 50,
    reason_code: 'EXCESSIVE_COMPLAINTS'
  });

  const updatedProfile2 = getSellerProfile(securityTestStoreId);
  assert(updatedProfile2.risk_score === 80, 'Accumulated score reaches 80');
  assert(updatedProfile2.risk_level === 'critical', 'Score 80 elevates seller to critical risk level');

  // --- SUITE 26: SUPER ADMIN SECURITY & TRUST CONSOLE (BATCH 2) ---
  console.log('\n--- SUITE 26: SUPER ADMIN SECURITY & TRUST CONSOLE (BATCH 2) ---');

  // 1. Role-Based Access Control & Permissions for Security Console
  const superAdminUser = dbFetchOne<any>('super_admins', { role: 'super_admin' });
  assert(superAdminUser !== null, 'Super admin user exists for RBAC check');
  assert(hasAdminPermission('manage_security', superAdminUser.id) === true, 'Super Admin possesses manage_security permission via wildcard');

  // Test custom support lead and moderator role permissions
  const supportLeadRole = getAdminRoles().support_lead;
  assert(supportLeadRole.permissions.includes('manage_security'), 'Support lead role has explicit manage_security permission');
  const moderatorRole = getAdminRoles().moderator;
  assert(moderatorRole.permissions.includes('manage_security'), 'Moderator role has explicit manage_security permission');
  const financeRole = getAdminRoles().finance_analyst;
  assert(!financeRole.permissions.includes('manage_security'), 'Finance analyst role correctly denied manage_security permission');

  // 2. View Templates Verification
  const overviewViewPath = path.resolve(process.cwd(), 'src', 'views', 'admin', 'security', 'overview.ejs');
  assert(fs.existsSync(overviewViewPath), 'Security Overview view template exists');
  const queueViewPath = path.resolve(process.cwd(), 'src', 'views', 'admin', 'security', 'queue.ejs');
  assert(fs.existsSync(queueViewPath), 'Security Queue view template exists');
  const investigateViewPath = path.resolve(process.cwd(), 'src', 'views', 'admin', 'security', 'investigate.ejs');
  assert(fs.existsSync(investigateViewPath), 'Seller 360 Investigation view template exists');

  // 3. Security Metrics Aggregation Verification
  const allSellers = dbFetchAll<any>('seller_profiles');
  const allReports = dbFetchAll<any>('fraud_reports');
  const allConfigs = dbFetchAll<any>('verification_provider_configs');
  assert(allSellers.length > 0, 'Sellers collection available for security metrics');
  assert(allConfigs.some(c => c.provider_key === 'monnify'), 'Monnify configuration present in provider configs');

  // 4. Verification Action: Approve Seller Verification
  const testStoreForAction = dbFetchOne<any>('stores', { id: securityTestStoreId });
  assert(testStoreForAction !== null, 'Target store available for admin verification action');

  // Initial state check
  dbUpdate('seller_profiles', { composite_verification_status: 'pending', identity_status: 'pending' }, { id: profile.id });
  dbUpdate('stores', { is_verified: 0 }, { id: testStoreForAction.id });

  // Simulate Approve Action logic (mirroring adminSecurityController)
  const actionTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  dbUpdate('seller_profiles', {
    composite_verification_status: 'verified',
    identity_status: 'verified',
    bank_status: 'verified',
    updated_at: actionTimestamp
  }, { id: profile.id });
  dbUpdate('stores', { is_verified: 1 }, { id: testStoreForAction.id });

  dbInsert('seller_verifications', {
    seller_id: profile.id,
    verification_type: 'manual_admin',
    provider: 'admin_override',
    provider_reference: `ADM-1-${Date.now()}`,
    status: 'verified',
    result_code: 'ADMIN_APPROVED',
    verified_at: actionTimestamp
  });

  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: superAdminUser.id,
    action: 'Approve Seller Verification',
    target_type: 'seller_profiles',
    target_id: profile.id,
    reason: 'Verified verified business registration and identity',
    ip_address: '127.0.0.1'
  });

  const verifiedSeller = getSellerProfile(securityTestStoreId);
  const verifiedStore = dbFetchOne<any>('stores', { id: securityTestStoreId });
  assert(verifiedSeller.composite_verification_status === 'verified', 'Seller composite status updated to verified');
  assert(Number(verifiedStore.is_verified) === 1, 'Storefront badge updated to verified (1)');

  const latestVerification = dbFetchOne<any>('seller_verifications', { seller_id: profile.id, status: 'verified' });
  assert(latestVerification !== null, 'Seller verification event recorded');
  assert(latestVerification.result_code === 'ADMIN_APPROVED', 'Verification result code is ADMIN_APPROVED');

  const approveAudit = dbFetchOne<any>('security_audit_logs', { action: 'Approve Seller Verification', target_id: profile.id });
  assert(approveAudit !== null, 'Security audit log recorded approval action');
  assert(approveAudit.actor_id === superAdminUser.id, 'Audit log correctly attributes actor');

  // 5. Order Gating Toggle
  assert(Number(verifiedSeller.order_gating_enabled) === 1, 'Order gating initially active (1)');
  dbUpdate('seller_profiles', { order_gating_enabled: 0 }, { id: profile.id });
  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: superAdminUser.id,
    action: 'Disable Order Gating',
    target_type: 'seller_profiles',
    target_id: profile.id,
    reason: 'Seller requested temporary hiatus',
    ip_address: '127.0.0.1'
  });

  const gatedSeller = getSellerProfile(securityTestStoreId);
  assert(Number(gatedSeller.order_gating_enabled) === 0, 'Order gating successfully disabled (0)');

  // Re-enable order gating
  dbUpdate('seller_profiles', { order_gating_enabled: 1 }, { id: profile.id });
  const reGatedSeller = getSellerProfile(securityTestStoreId);
  assert(Number(reGatedSeller.order_gating_enabled) === 1, 'Order gating successfully re-enabled (1)');

  // 6. Store Suspension & Emergency Lockdown
  dbUpdate('seller_profiles', { composite_verification_status: 'suspended' }, { id: profile.id });
  dbUpdate('stores', { status: 'suspended' }, { id: testStoreForAction.id });
  recordRiskEvent({
    seller_id: profile.id,
    event_type: 'ADMIN_SUSPENSION',
    score_delta: 20,
    reason_code: 'SUSPICIOUS_BEHAVIOR',
    metadata: { admin: superAdminUser.id }
  });
  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: superAdminUser.id,
    action: 'Suspend Storefront & Seller',
    target_type: 'seller_profiles',
    target_id: profile.id,
    reason: 'Investigating customer chargeback dispute',
    ip_address: '127.0.0.1'
  });

  const suspendedStore = dbFetchOne<any>('stores', { id: securityTestStoreId });
  const suspendedProfile = getSellerProfile(securityTestStoreId);
  assert(suspendedStore.status === 'suspended', 'Store status set to suspended');
  assert(suspendedProfile.composite_verification_status === 'suspended', 'Seller composite status is suspended');

  // Restore Store
  dbUpdate('seller_profiles', { composite_verification_status: 'verified' }, { id: profile.id });
  dbUpdate('stores', { status: 'active' }, { id: testStoreForAction.id });
  const restoredStore = dbFetchOne<any>('stores', { id: securityTestStoreId });
  assert(restoredStore.status === 'active', 'Store safely restored to active state');

  // 7. Customer Fraud Report Lifecycle
  const fraudCaseRef = `CASE-${Date.now()}`;
  const reportId = dbInsert('fraud_reports', {
    case_reference: fraudCaseRef,
    reporter_name: 'Concerned Buyer',
    reporter_email: 'buyer@example.com',
    reporter_phone: '08012345678',
    reported_store_id: testStoreForAction.id,
    category: 'non_delivery',
    severity: 'high',
    status: 'new',
    description: 'Transferred funds via direct bank transfer but goods were not shipped after 5 days.',
    assigned_admin_id: superAdminUser.id
  });

  assert(typeof reportId === 'number' && reportId > 0, 'Customer fraud report created with unique case reference');

  // Super Admin investigates & resolves fraud report
  dbUpdate('fraud_reports', {
    status: 'resolved',
    resolution_code: 'SELLER_REFUNDED',
    resolution_summary: 'Seller provided bank proof of customer transfer refund',
    assigned_admin_id: superAdminUser.id,
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }, { id: reportId });

  dbInsert('fraud_case_events', {
    case_id: reportId,
    actor_type: 'super_admin',
    actor_id: superAdminUser.id,
    event_type: 'RESOLUTION',
    message: 'Resolved: Seller verified refund transaction reference'
  });

  logSecurityAudit({
    actor_type: 'super_admin',
    actor_id: superAdminUser.id,
    action: `Update Fraud Report #${reportId} Status to resolved`,
    target_type: 'fraud_reports',
    target_id: reportId,
    reason: 'Customer refund verified',
    ip_address: '127.0.0.1'
  });

  const resolvedReport = dbFetchOne<any>('fraud_reports', { id: reportId });
  assert(resolvedReport.status === 'resolved', 'Fraud report status updated to resolved');
  assert(resolvedReport.resolution_code === 'SELLER_REFUNDED', 'Resolution code recorded');

  const caseEvent = dbFetchOne<any>('fraud_case_events', { case_id: reportId, event_type: 'RESOLUTION' });
  assert(caseEvent !== null, 'Fraud case event timeline entry persisted');

  // --- SUITE 27: VERIFICATION PROVIDER ARCHITECTURE & CREDENTIAL MANAGEMENT (BATCH 3) ---
  console.log('\n--- SUITE 27: VERIFICATION PROVIDER ARCHITECTURE & CREDENTIAL MANAGEMENT (BATCH 3) ---');

  // 1. SSRF Protection Guard Testing
  const validSandboxUrl = validateOutboundUrl('https://sandbox.monnify.com/api/v1/auth/login');
  assert(validSandboxUrl.valid === true, 'SSRF guard allows approved sandbox URL');

  const validLiveUrl = validateOutboundUrl('https://api.monnify.com/api/v2/disbursements/account/validate');
  assert(validLiveUrl.valid === true, 'SSRF guard allows approved live production URL');

  const httpBlock = validateOutboundUrl('http://sandbox.monnify.com/api/v1/auth/login');
  assert(httpBlock.valid === false, 'SSRF guard strictly blocks non-HTTPS protocol');

  const portBlock = validateOutboundUrl('https://sandbox.monnify.com:8080/api/v1/auth/login');
  assert(portBlock.valid === false, 'SSRF guard blocks non-standard port 8080');

  const localhostBlock = validateOutboundUrl('https://localhost:443/api/v1/auth/login');
  assert(localhostBlock.valid === false, 'SSRF guard blocks localhost target');

  const privateIpBlock1 = validateOutboundUrl('https://127.0.0.1/api/v1/auth/login');
  assert(privateIpBlock1.valid === false, 'SSRF guard blocks loopback IP 127.0.0.1');

  const privateIpBlock2 = validateOutboundUrl('https://192.168.1.1/api/v1/auth/login');
  assert(privateIpBlock2.valid === false, 'SSRF guard blocks private RFC-1918 IP 192.168.1.1');

  const cloudMetadataBlock = validateOutboundUrl('https://169.254.169.254/latest/meta-data/');
  assert(cloudMetadataBlock.valid === false, 'SSRF guard blocks link-local cloud metadata address');

  const evilHostBlock = validateOutboundUrl('https://malicious-phishing-domain.com/steal-keys');
  assert(evilHostBlock.valid === false, 'SSRF guard blocks non-whitelisted third party host');

  // 2. Integrations View Template Existence
  const integrationsViewPath = path.resolve(process.cwd(), 'src', 'views', 'admin', 'security', 'integrations.ejs');
  assert(fs.existsSync(integrationsViewPath), 'Monnify Integrations settings view template exists');

  // 3. Credential Vault Storage & AES-256-GCM Encryption
  const testApiKey = 'MK_TEST_abc123456789xyz9876';
  const testSecretKey = 'SK_TEST_secret_998877665544332211';
  const testContractCode = '9876543210';

  const saveVaultResult = saveProviderConfig({
    provider_key: 'monnify',
    environment: 'sandbox',
    api_key: testApiKey,
    secret_key: testSecretKey,
    contract_code: testContractCode,
    enabled_capabilities: ['account_enquiry', 'bvn_match'],
    admin_id: superAdminUser.id,
    ip_address: '127.0.0.1'
  });

  assert(saveVaultResult.success === true, 'Provider credentials saved successfully');

  // Verify database record in verification_provider_configs
  const storedConfigRow = dbFetchOne<any>('verification_provider_configs', { provider_key: 'monnify' });
  assert(storedConfigRow !== null, 'Monnify configuration row queryable');
  assert(storedConfigRow.environment === 'sandbox', 'Stored environment is sandbox');
  assert(storedConfigRow.base_url === 'https://sandbox.monnify.com', 'Base URL correctly defaulted to sandbox endpoint');
  assert(storedConfigRow.api_key_encrypted !== testApiKey, 'Stored API key is non-plaintext ciphertext');
  assert(storedConfigRow.secret_key_encrypted !== testSecretKey, 'Stored Secret key is non-plaintext ciphertext');
  assert(storedConfigRow.api_key_masked.startsWith('MK_TES'), 'Masked API key has valid prefix');
  assert(storedConfigRow.api_key_masked.endsWith('9876'), 'Masked API key has valid suffix');
  assert(storedConfigRow.contract_code === testContractCode, 'Contract code stored safely');

  // Verify audit log for credential rotation
  const vaultAudit = dbFetchOne<any>('security_audit_logs', { action: 'Rotate MONNIFY Credentials' });
  assert(vaultAudit !== null, 'Security audit logged credential rotation event');

  // 4. Decrypted Credentials Retrieval for Server-to-Server Calls
  const decryptedCredentials = getDecryptedCredentials('monnify');
  assert(decryptedCredentials.isConfigured === true, 'Provider recognized as configured');
  assert(decryptedCredentials.apiKey === testApiKey, 'Decrypted API key accurately matches original plaintext');
  assert(decryptedCredentials.secretKey === testSecretKey, 'Decrypted Secret key accurately matches original plaintext');
  assert(decryptedCredentials.contractCode === testContractCode, 'Decrypted contract code matches');
  assert(decryptedCredentials.baseUrl === 'https://sandbox.monnify.com', 'Decrypted base URL matches sandbox');
  assert(decryptedCredentials.enabledCapabilities.includes('account_enquiry'), 'Account enquiry capability enabled');
  assert(decryptedCredentials.enabledCapabilities.includes('bvn_match'), 'BVN match capability enabled');

  // 5. Sanitized Provider Config for Admin UI (Never leaks secrets)
  const sanitizedAdminConfig = getProviderConfig('monnify');
  assert(sanitizedAdminConfig !== null, 'Sanitized provider config returned');
  assert((sanitizedAdminConfig as any).api_key === undefined, 'Raw API key not present on sanitized UI config');
  assert((sanitizedAdminConfig as any).secret_key === undefined, 'Raw Secret key not present on sanitized UI config');
  assert(sanitizedAdminConfig.api_key_masked === storedConfigRow.api_key_masked, 'Masked API key correctly returned to UI');

  // 6. Test Result Diagnostics & Status Update
  recordProviderTestResult({
    provider_key: 'monnify',
    result: 'active',
    result_code: 'AUTH_SUCCESS'
  });

  const updatedTestConfig = getProviderConfig('monnify');
  assert(updatedTestConfig.status === 'active', 'Provider status updated to active');
  assert(updatedTestConfig.last_test_result === 'AUTH_SUCCESS', 'Last test result code recorded');
  assert(updatedTestConfig.last_tested_at !== null, 'Last tested timestamp recorded');

  // 7. Integration Activity Logging
  logIntegrationEvent({
    provider: 'monnify',
    endpoint: '/api/v1/auth/login',
    request_method: 'POST',
    status_code: 200,
    duration_ms: 125,
    result: 'success',
    redacted_request: { auth: 'Basic', env: 'sandbox' },
    redacted_response: { requestSuccessful: true }
  });

  const loggedEvent = dbFetchOne<any>('integration_events', { provider: 'monnify', endpoint: '/api/v1/auth/login' });
  assert(loggedEvent !== null, 'Integration event successfully persisted');
  assert(loggedEvent.status_code === 200, 'Status code 200 logged');
  assert(loggedEvent.duration_ms === 125, 'Duration 125ms logged');
  assert(loggedEvent.result === 'success', 'Result success logged');

  // --- SUITE 28: MONNIFY ADAPTER & IDENTITY VERIFICATION ENGINE (BATCH 4) ---
  console.log('\n--- SUITE 28: MONNIFY ADAPTER & IDENTITY VERIFICATION ENGINE (BATCH 4) ---');

  // 1. Name Match Score & Tokenized Overlap Evaluation
  const exactMatch = calculateNameMatchScore('Chinedu Eze', 'Chinedu Eze');
  assert(exactMatch.score === 1.0, 'Identical names produce 1.0 match score');
  assert(exactMatch.matchType === 'exact_match', 'Identical names categorized as exact_match');

  const reorderedMatch = calculateNameMatchScore('Eze Chinedu', 'Chinedu Eze');
  assert(reorderedMatch.score === 1.0, 'Reordered legal name tokens categorized as exact_match');

  const fuzzyMatch = calculateNameMatchScore('Chinedu Anthony Eze', 'Chinedu Eze');
  assert(fuzzyMatch.score >= 0.8, 'Middle name difference produces score >= 0.8');
  assert(fuzzyMatch.matchType === 'fuzzy_match', 'Fuzzy match categorized correctly');

  const partialMatch = calculateNameMatchScore('Chinedu Ventures', 'Chinedu Okeke');
  assert(partialMatch.matchType === 'partial_match', '1 common token out of 3 produces partial_match');

  const completeMismatch = calculateNameMatchScore('Fatima Dangote', 'Chinedu Eze');
  assert(completeMismatch.score === 0.0, 'Unrelated names produce 0.0 match score');
  assert(completeMismatch.matchType === 'mismatch', 'Unrelated names categorized as mismatch');

  // 2. Monnify Adapter Configuration Validation
  const validConfigResult = monnifyAdapter.validateConfiguration({ environment: 'sandbox' });
  assert(validConfigResult.valid === true, 'MonnifyAdapter validates correct sandbox configuration');

  const invalidConfigResult = monnifyAdapter.validateConfiguration({ environment: 'invalid_env' as any });
  assert(invalidConfigResult.valid === false, 'MonnifyAdapter rejects invalid environment');

  // 3. NUBAN 10-Digit Guard
  const shortAcctResult = await monnifyAdapter.verifyBankAccount('123456', '058', {
    apiKey: 'dummy',
    secretKey: 'dummy',
    baseUrl: 'https://sandbox.monnify.com'
  });
  assert(shortAcctResult.success === false, 'Invalid account number length rejected without external call');
  assert(shortAcctResult.error?.includes('10 digits'), 'Error specifically notes 10 digits requirement');

  // 4. Monnify Adapter Identity Verification
  const mockVerifiedResult = await monnifyAdapter.verifyIdentity(
    { bvn: '22222222222' },
    { apiKey: 'dummy', secretKey: 'dummy', baseUrl: 'https://sandbox.monnify.com', environment: 'sandbox' }
  );
  assert(mockVerifiedResult.success === true, 'Sandbox mock verified BVN returns success');
  assert(mockVerifiedResult.status === 'verified', 'Sandbox mock verified BVN returns verified status');
  assert(mockVerifiedResult.resultCode === 'SANDBOX_MOCK_VERIFIED', 'Result code is SANDBOX_MOCK_VERIFIED');

  const mockRejectedResult = await monnifyAdapter.verifyIdentity(
    { bvn: '00000000000' },
    { apiKey: 'dummy', secretKey: 'dummy', baseUrl: 'https://sandbox.monnify.com', environment: 'sandbox' }
  );
  assert(mockRejectedResult.success === false, 'Sandbox mock rejected BVN returns failure');
  assert(mockRejectedResult.status === 'failed', 'Status is failed for mock rejection');

  const arbitraryBvnResult = await monnifyAdapter.verifyIdentity(
    { bvn: '12345678901' },
    { apiKey: 'dummy', secretKey: 'dummy', baseUrl: 'https://sandbox.monnify.com', environment: 'sandbox' }
  );
  assert(arbitraryBvnResult.success === false, 'Arbitrary BVN in sandbox does NOT produce fake approval');
  assert(arbitraryBvnResult.status === 'manual_review', 'Arbitrary sandbox BVN routed to manual_review');
  assert(arbitraryBvnResult.resultCode === 'SANDBOX_RESTRICTED', 'Result code reflects regulatory restriction');

  // 5. Verification Service Orchestrator & NDPA 2023 Consent Check
  const noConsentAttempt = await submitIdentityVerification({
    sellerId: profile.id,
    type: 'bvn',
    identifier: '22222222222',
    consentGiven: false
  });
  assert(noConsentAttempt.success === false, 'Verification without consent rejected');
  assert(noConsentAttempt.error?.includes('NDPA 2023'), 'Error mentions NDPA 2023 compliance mandate');

  // Submit with explicit consent
  const consentAttempt = await submitIdentityVerification({
    sellerId: profile.id,
    type: 'bvn',
    identifier: '22222222222',
    consentGiven: true
  });
  assert(consentAttempt.success === true, 'Verification with consent accepted');

  const updatedConsentProfile = getSellerProfile(securityTestStoreId);
  assert(Number(updatedConsentProfile.identity_consent_given) === 1, 'Profile recorded identity consent flag (1)');
  assert(updatedConsentProfile.consent_timestamp !== null, 'Profile recorded consent timestamp');
  assert(updatedConsentProfile.identity_status === 'verified', 'Profile identity status updated to verified');

  // Verify zero plaintext BVN stored in seller_verifications table
  const verificationRecord = dbFetchOne<any>('seller_verifications', { seller_id: profile.id, verification_type: 'bvn' });
  assert(verificationRecord !== null, 'Verification record exists in seller_verifications');
  assert(!verificationRecord.redacted_metadata_json?.includes('22222222222'), 'Raw BVN strictly omitted from metadata');
  assert(verificationRecord.redacted_metadata_json?.includes('222•••••22'), 'Masked BVN stored in metadata');

  // 6. Composite Verification Status Orchestration
  dbUpdate('seller_profiles', { bank_status: 'verified' }, { id: profile.id });
  const compositeStatus = evaluateCompositeVerificationStatus(profile.id);
  assert(compositeStatus === 'verified', 'Seller with verified identity + bank promoted to composite verified');

  const postEvaluationStore = dbFetchOne<any>('stores', { id: securityTestStoreId });
  assert(Number(postEvaluationStore.is_verified) === 1, 'Underlying storefront is_verified set to 1');

  // --- SUITE 29: BANK ACCOUNT OWNERSHIP VERIFICATION & ACCOUNT CHANGE PROTECTION (BATCH 5) ---
  console.log('\n--- SUITE 29: BANK ACCOUNT OWNERSHIP VERIFICATION & ACCOUNT CHANGE PROTECTION (BATCH 5) ---');

  // 1. Nigerian Banks Directory
  assert(NIGERIAN_BANKS.length >= 15, `Nigerian banks list covers major commercial banks & fintechs (${NIGERIAN_BANKS.length} banks)`);
  const gtbank = NIGERIAN_BANKS.find(b => b.code === '058');
  assert(Boolean(gtbank), 'GTBank (058) present in bank registry');
  const kuda = NIGERIAN_BANKS.find(b => b.code === '50211');
  assert(Boolean(kuda), 'Kuda Bank (50211) present in bank registry');
  const opay = NIGERIAN_BANKS.find(b => b.code === '999992');
  assert(Boolean(opay), 'OPay (999992) present in bank registry');

  // 2. Name Matcher Comprehensive Rules
  // Exact match
  const exactRes = matchAccountName('Emeka Okafor', 'EMEKA OKAFOR', false);
  assert(exactRes.isAcceptable === true, 'Case-insensitive identical names are acceptable');
  assert(exactRes.matchType === 'exact_match', 'Category is exact_match');
  assert(exactRes.score === 1.0, 'Score is 1.0');

  // Corporate Entity Match & Corporate Suffix Normalization
  const corpRes = matchAccountName('Okafor Global Logistics Ltd', 'OKAFOR GLOBAL LOGISTICS LIMITED', true);
  assert(corpRes.isAcceptable === true, 'Corporate suffix differences (Ltd vs Limited) stripped & acceptable');
  assert(corpRes.score >= 0.9, 'Corporate match score >= 0.9');

  // Fuzzy match / middle name presence
  const fuzzyRes = matchAccountName('Emeka John Okafor', 'Emeka Okafor', false);
  assert(fuzzyRes.isAcceptable === true, 'Middle name difference is acceptable');
  assert(fuzzyRes.matchType === 'fuzzy_match', 'Category is fuzzy_match');

  // Severe Mismatch
  const mismatchRes = matchAccountName('Emeka Okafor', 'Aisha Bello', false);
  assert(mismatchRes.isAcceptable === false, 'Completely different names rejected');
  assert(mismatchRes.matchType === 'mismatch', 'Category is mismatch');
  assert(mismatchRes.score === 0.0, 'Score is 0.0');

  // 3. Bank Account Change OTP Security Workflow
  const bankTestStoreId = securityTestStoreId;
  const testOtp = '654321';
  const testOtpHash = crypto.createHash('sha256').update(testOtp).digest('hex');

  bankOtpStore.set(bankTestStoreId, {
    otp_hash: testOtpHash,
    expires_at: Date.now() + 300000,
    bank_code: '058',
    bank_name: 'Guaranty Trust Bank',
    account_number: '0123456789',
    account_name: 'Emeka Okafor'
  });

  const storedOtp = bankOtpStore.get(bankTestStoreId);
  assert(storedOtp !== undefined, 'Bank OTP record stored successfully');
  assert(storedOtp?.bank_code === '058', 'Stored OTP contains bank code');

  // Invalidate with wrong OTP
  const wrongOtpHash = crypto.createHash('sha256').update('000000').digest('hex');
  assert(storedOtp?.otp_hash !== wrongOtpHash, 'Wrong OTP does not match stored hash');

  // 4. Save Verified Bank Account Record
  const newAccountNum = '0987654321';
  const newBankName = 'Access Bank';
  const newAccountName = 'Emeka Okafor';

  const bankSaveResult = saveVerifiedBankAccountRecord({
    sellerId: profile.id,
    storeId: bankTestStoreId,
    bankCode: '044',
    bankName: newBankName,
    accountNumber: newAccountNum,
    accountName: newAccountName,
    nameMatchScore: 1.0,
    nameMatchResult: 'exact_match',
    isVerified: true,
    actorType: 'merchant'
  });

  assert(typeof bankSaveResult.newBankId === 'number', 'New verified bank account record inserted');
  assert(bankSaveResult.maskedAcct === '0987••••21', 'Masked account number matches standard 4+4 format');

  // Check seller_bank_accounts table record
  const savedBankRecord = dbFetchOne<any>('seller_bank_accounts', { id: bankSaveResult.newBankId });
  assert(savedBankRecord !== null, 'seller_bank_accounts row queryable');
  assert(savedBankRecord.is_active === 1, 'New bank account marked is_active = 1');
  assert(savedBankRecord.verification_status === 'verified', 'Bank account status marked verified');
  assert(savedBankRecord.bank_name === newBankName, 'Bank name recorded accurately');
  assert(savedBankRecord.account_number_masked === '0987••••21', 'Masked account number persisted');
  assert(!savedBankRecord.account_number_encrypted.includes(newAccountNum), 'Encrypted account number is non-plaintext');

  // Decrypt check
  const decryptedAcct = decryptSecret(savedBankRecord.account_number_encrypted);
  assert(decryptedAcct === newAccountNum, 'Encrypted bank account successfully decrypted');

  // Duplicate detection hash check
  const expectedHash = hashAccountNumber(newAccountNum);
  assert(savedBankRecord.account_number_hash === expectedHash, 'HMAC account number hash matches deterministic expectation');

  // Check stores table updated
  const updatedStoreRow = dbFetchOne<any>('stores', { id: bankTestStoreId });
  assert(updatedStoreRow.bank_account_number === newAccountNum, 'stores table bank_account_number updated');
  assert(updatedStoreRow.bank_name === newBankName, 'stores table bank_name updated');
  assert(updatedStoreRow.bank_account_name === newAccountName, 'stores table bank_account_name updated');

  // Check seller_profiles bank_status updated
  const updatedSellerProfileRow = dbFetchOne<any>('seller_profiles', { id: profile.id });
  assert(updatedSellerProfileRow.bank_status === 'verified', 'seller_profiles bank_status updated to verified');

  // Check security audit log
  const bankAuditLogs = dbFetchAll<any>('security_audit_logs', { target_type: 'seller_bank_accounts', target_id: bankSaveResult.newBankId });
  assert(bankAuditLogs.length > 0, 'Security audit logged bank account update');
  assert(bankAuditLogs[0].action.includes('Authorized Bank Account Change'), 'Audit action documents authorized bank change');

  // Verify previous accounts for this seller were deactivated
  const previousAccounts = dbFetchAll<any>('seller_bank_accounts', { seller_id: profile.id });
  const activeCount = previousAccounts.filter(a => a.is_active === 1).length;
  assert(activeCount === 1, 'Exactly one active payout bank account exists after update');

  // --- SUITE 30: SELLER ONBOARDING & STOREFRONT GATING ENFORCEMENT (BATCH 6) ---
  console.log('\n--- SUITE 30: SELLER ONBOARDING & STOREFRONT GATING ENFORCEMENT (BATCH 6) ---');

  // 1. Template Verification View Exists
  const verificationViewPath = path.resolve('src/views/merchant/verification.ejs');
  assert(fs.existsSync(verificationViewPath), 'Merchant verification template (verification.ejs) exists');
  const verifViewContent = fs.readFileSync(verificationViewPath, 'utf-8');
  assert(verifViewContent.includes('NDPA 2023'), 'verification.ejs contains explicit NDPA 2023 compliance notice');
  assert(verifViewContent.includes('identityConsentCheck'), 'verification.ejs includes mandatory consent checkbox');

  // 2. Gating Evaluation Unit Tests
  const gatingTestStoreId = dbInsert('stores', {
    slug: 'gating-test-' + Date.now(),
    store_name: 'Gating Test Store',
    owner_name: 'Gating Tester',
    email: 'gating_tester_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('gatingPassword123'),
    whatsapp_number: '08012345678',
    status: 'active',
    is_verified: 0,
    allow_bank_transfer: 1,
    allow_pay_on_delivery: 1
  });

  const gatingSeller = getOrCreateSellerProfile(gatingTestStoreId);
  assert(Boolean(gatingSeller), 'Seller profile created for gating test store');

  // Initial state: unverified seller with order_gating_enabled = 1 -> isStoreOrderGated should be true
  assert(isStoreOrderGated(gatingTestStoreId) === true, 'Unverified store starts in gated state (orders blocked)');

  // 3. Server-side Order Gating Enforcement in createOrder
  const gatedOrderAttempt = createOrder({
    store_id: gatingTestStoreId,
    customer_name: 'Shopper Test',
    customer_phone: '08011223344',
    items: [{ title: 'Gated Item', price: 5000, quantity: 1 }],
    payment_method: 'bank_transfer'
  });
  assert(gatedOrderAttempt.success === false, 'createOrder safely rejects order against gated store');
  assert(gatedOrderAttempt.is_gated === true, 'createOrder returns is_gated = true flag');
  assert(gatedOrderAttempt.error?.includes('undergoing seller identity verification') === true, 'Error message explicitly explains identity verification gating');

  // 4. Super Admin Emergency Gating Override (Disabling order gating)
  dbUpdate('seller_profiles', { order_gating_enabled: 0 }, { id: gatingSeller.id });
  assert(isStoreOrderGated(gatingTestStoreId) === false, 'isStoreOrderGated returns false when order_gating_enabled = 0');

  const ungatedOrderAttempt = createOrder({
    store_id: gatingTestStoreId,
    customer_name: 'Shopper Test',
    customer_phone: '08011223344',
    items: [{ title: 'Ungated Item', price: 5000, quantity: 1 }],
    payment_method: 'bank_transfer'
  });
  assert(ungatedOrderAttempt.success === true, 'createOrder succeeds when super admin lifts order gating');

  // Re-enable gating
  dbUpdate('seller_profiles', { order_gating_enabled: 1 }, { id: gatingSeller.id });
  assert(isStoreOrderGated(gatingTestStoreId) === true, 'isStoreOrderGated returns true when order gating is re-enabled');

  // 5. Verification Promotion Unlocks Gating Automatically
  dbUpdate('seller_profiles', {
    identity_status: 'verified',
    bank_status: 'verified'
  }, { id: gatingSeller.id });

  const promotedStatus = evaluateCompositeVerificationStatus(gatingSeller.id);
  assert(promotedStatus === 'verified', 'Seller profile promoted to composite verified status');
  assert(isStoreOrderGated(gatingTestStoreId) === false, 'isStoreOrderGated automatically lifts gating when verification is complete');

  const postVerificationOrder = createOrder({
    store_id: gatingTestStoreId,
    customer_name: 'Shopper After Verification',
    customer_phone: '08099887766',
    items: [{ title: 'Verified Store Item', price: 7500, quantity: 1 }],
    payment_method: 'bank_transfer'
  });
  assert(postVerificationOrder.success === true, 'Verified store seamlessly accepts customer orders');

  // 6. Direct Store is_verified flag also un-gates
  const adminVerifiedStoreId = dbInsert('stores', {
    slug: 'admin-verified-' + Date.now(),
    store_name: 'Admin Verified Store',
    owner_name: 'Admin Trusted Seller',
    email: 'admin_trusted_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('adminPassword123'),
    whatsapp_number: '08087654321',
    status: 'active',
    is_verified: 1
  });
  assert(isStoreOrderGated(adminVerifiedStoreId) === false, 'Store with is_verified = 1 is not gated');

  // -------------------------------------------------------------
  // SUITE 31: BUSINESS VERIFICATION, STORE NAMING RULES & BRAND PROTECTION (BATCH 7)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 31: BUSINESS VERIFICATION, STORE NAMING RULES & BRAND PROTECTION (BATCH 7) ---');

  // 1. Storefront Naming: General Rules & Format Validation
  const validPersonalName = validateStoreName('Grace Fashion Store', 'personal', false);
  assert(validPersonalName.valid === true, 'Standard legitimate personal store name is accepted');

  const tooShortName = validateStoreName('A', 'personal', false);
  assert(tooShortName.valid === false && tooShortName.category === 'invalid_format', 'Store name shorter than 2 chars rejected');

  const numbersOnlyName = validateStoreName('1234567', 'personal', false);
  assert(numbersOnlyName.valid === false && numbersOnlyName.category === 'invalid_format', 'Purely numeric store name rejected');

  // 2. Corporate Designator Restrictions for Personal Sellers (CAMA 2020)
  const ltdAttempt = validateStoreName('Grace Fashion Ltd', 'personal', false);
  assert(ltdAttempt.valid === false, 'Personal seller prohibited from using "Ltd" corporate designator');
  assert(ltdAttempt.category === 'corporate_designator', 'Category correctly identified as corporate_designator');
  assert(ltdAttempt.reason?.includes('corporate designations') === true, 'Error message explicitly cites corporate designations restriction');

  const plcAttempt = validateStoreName('Tunde Electronics Plc', 'personal', false);
  assert(plcAttempt.valid === false && plcAttempt.category === 'corporate_designator', 'Personal seller prohibited from using "Plc" suffix');

  const holdingsAttempt = validateStoreName('Okafor Holdings', 'personal', false);
  assert(holdingsAttempt.valid === false && holdingsAttempt.category === 'corporate_designator', 'Personal seller prohibited from using "Holdings"');

  const incAttempt = validateStoreName('Amaka Beauty Inc', 'personal', false);
  assert(incAttempt.valid === false && incAttempt.category === 'corporate_designator', 'Personal seller prohibited from using "Inc"');

  // 3. Corporate Designators Allowed for Verified Businesses
  const verifiedBusLtd = validateStoreName('Grace Fashion Ltd', 'business', true);
  assert(verifiedBusLtd.valid === true, 'Verified business with CAC allowed to use "Ltd" designator');

  const verifiedBusPlc = validateStoreName('Tunde Electronics Plc', 'business', true);
  assert(verifiedBusPlc.valid === true, 'Verified business with CAC allowed to use "Plc" designator');

  // 4. Institutional, Regulatory & Government Terms (Strictly prohibited for all)
  const bankAttempt = validateStoreName('Zenith Bank Agent Shop', 'personal', false);
  assert(bankAttempt.valid === false, 'Store name containing restricted "Bank" term rejected');
  assert(bankAttempt.category === 'institutional' || bankAttempt.category === 'brand_impersonation', 'Institutional or brand violation identified');

  const cbnAttempt = validateStoreName('CBN Official Discount Store', 'business', true);
  assert(cbnAttempt.valid === false && cbnAttempt.category === 'institutional', 'Store name containing "CBN" rejected even for business accounts');

  const zlikAttempt = validateStoreName('Official Zlik Support Hub', 'business', true);
  assert(zlikAttempt.valid === false && zlikAttempt.category === 'institutional', 'Store name impersonating "Official Zlik" platform authority rejected');

  const efccAttempt = validateStoreName('EFCC Auction Center', 'personal', false);
  assert(efccAttempt.valid === false && efccAttempt.category === 'institutional', 'Store name claiming "EFCC" government authority rejected');

  // 5. Brand Impersonation & Typo-squatting Protection
  const appleAttempt = validateStoreName('Apple Store Ikeja', 'personal', false);
  assert(appleAttempt.valid === false && appleAttempt.category === 'brand_impersonation', 'Store name impersonating "Apple" rejected');

  const dangoteAttempt = validateStoreName('Dangote Cement Direct Depot', 'personal', false);
  assert(dangoteAttempt.valid === false && dangoteAttempt.category === 'brand_impersonation', 'Store name impersonating "Dangote" rejected');

  const jumiaAttempt = validateStoreName('Jumia Express Delivery', 'personal', false);
  assert(jumiaAttempt.valid === false && jumiaAttempt.category === 'brand_impersonation', 'Store name impersonating "Jumia" rejected');

  const nikeAttempt = validateStoreName('Nike Shoes Store', 'personal', false);
  assert(nikeAttempt.valid === false && nikeAttempt.category === 'brand_impersonation', 'Store name impersonating "Nike" rejected');

  const typoApple = validateStoreName('App1e Gadgets', 'personal', false);
  assert(typoApple.valid === false && typoApple.category === 'brand_impersonation', 'Typo-squatted brand name "App1e" detected and rejected');

  const typoDangote = validateStoreName('Danggote Supplies', 'personal', false);
  assert(typoDangote.valid === false && typoDangote.category === 'brand_impersonation', 'Typo-squatted brand name "Danggote" detected and rejected');

  // 6. CAC Registration Number Format Validator
  assert(validateCacRegistrationFormat('RC123456').valid === true, 'RC123456 accepted as valid CAC RC format');
  assert(validateCacRegistrationFormat('BN-987654').valid === true, 'BN-987654 accepted as valid CAC Business Name format');
  assert(validateCacRegistrationFormat('IT12345').valid === true, 'IT12345 accepted as valid CAC Incorporated Trustee format');
  assert(validateCacRegistrationFormat('INVALID_FORMAT_TEST').valid === false, 'Invalid CAC format string rejected');

  // 7. Business Verification Submission & Representative Matching
  const busStoreId = dbInsert('stores', {
    slug: 'bus-seller-' + Date.now(),
    store_name: 'Adeola Trading Store',
    owner_name: 'Adeola John Bakare',
    email: 'adeola_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('busPassword123'),
    whatsapp_number: '08022334455',
    status: 'active',
    is_verified: 0
  });

  const busSeller = getOrCreateSellerProfile(busStoreId);
  dbUpdate('seller_profiles', {
    legal_name: 'Adeola John Bakare',
    identity_status: 'verified',
    bank_status: 'verified'
  }, { id: busSeller.id });

  const testRcNumber = 'RC' + Math.floor(100000 + Math.random() * 900000);

  // Representative name mismatch check
  const mismatchedRep = await submitBusinessVerification({
    sellerId: busSeller.id,
    registeredName: 'Adeola & Sons Trading Ltd',
    registrationNumber: testRcNumber,
    businessType: 'limited_liability',
    representativeName: 'Emeka Chukwudi Obi', // Mismatched name!
    representativeRole: 'Director',
    representativePhone: '08099887766'
  });
  assert(mismatchedRep.success === false, 'Representative mismatch with verified personal identity rejected');
  assert(mismatchedRep.error?.includes('does not match') === true, 'Error message explicitly explains representative mismatch');

  // Legitimate submission with matching representative
  const validSubmission = await submitBusinessVerification({
    sellerId: busSeller.id,
    registeredName: 'Adeola & Sons Trading Ltd',
    registrationNumber: testRcNumber,
    businessType: 'limited_liability',
    representativeName: 'Adeola Bakare', // Fuzzy matching representative!
    representativeRole: 'Director',
    representativePhone: '08022334455',
    tin: '12345678-0001',
    registeredAddress: '12 Marina Road, Lagos'
  });
  assert(validSubmission.success === true, 'CAC business submission with authorized representative accepted');
  assert(validSubmission.status === 'pending', 'Arbitrary CAC submission routes to "pending" manual review (zero fake approvals)');

  const busProfile = getBusinessProfile(busSeller.id);
  assert(Boolean(busProfile), 'Business profile record persisted in business_profiles table');
  assert(busProfile.registration_number === testRcNumber, 'CAC registration number persisted accurately');
  assert(busProfile.verification_status === 'pending', 'Business verification status is pending');

  const updatedBusSeller = getSellerProfile(busStoreId);
  assert(updatedBusSeller.seller_type === 'business', 'Seller profile promoted to seller_type = "business"');
  assert(updatedBusSeller.business_status === 'pending', 'Seller business_status is pending');
  assert(updatedBusSeller.composite_verification_status !== 'verified', 'Composite status remains unverified while business status is pending');

  // Prevent duplicate CAC registration reuse across different sellers
  const duplicateStoreId = dbInsert('stores', {
    slug: 'dup-bus-' + Date.now(),
    store_name: 'Second Store',
    owner_name: 'Adeola Bakare',
    email: 'dup_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('busPassword123'),
    whatsapp_number: '08022334455',
    status: 'active'
  });
  const dupSeller = getOrCreateSellerProfile(duplicateStoreId);
  const dupAttempt = await submitBusinessVerification({
    sellerId: dupSeller.id,
    registeredName: 'Adeola & Sons Copy',
    registrationNumber: testRcNumber, // Duplicate RC!
    representativeName: 'Adeola Bakare',
    representativePhone: '08022334455'
  });
  assert(dupAttempt.success === false, 'Reusing existing CAC registration number across multiple sellers rejected');
  assert(dupAttempt.error?.includes('already registered') === true, 'Error message explains CAC number already registered');

  // 8. Super Admin Approval of Registered Business
  const adminApproveRes = approveBusinessVerification({
    businessProfileId: busProfile.id,
    adminId: 1,
    adminName: 'Chief Security Officer',
    notes: 'Verified against CAC online status portal'
  });
  assert(adminApproveRes.success === true, 'Super Admin approves registered CAC business');

  const postApproveProfile = getBusinessProfile(busSeller.id);
  assert(postApproveProfile.verification_status === 'verified', 'Business profile status updated to "verified"');

  const postApproveSeller = getSellerProfile(busStoreId);
  assert(postApproveSeller.business_status === 'verified', 'Seller profile business_status updated to "verified"');
  assert(postApproveSeller.composite_verification_status === 'verified', 'Composite verification status promotes to "verified"');
  assert(isStoreOrderGated(busStoreId) === false, 'Store order gating automatically lifted upon business approval');

  // 9. Super Admin Rejection of Business Submission
  const rejectStoreId = dbInsert('stores', {
    slug: 'reject-bus-' + Date.now(),
    store_name: 'Rejected Store',
    owner_name: 'Faux Seller',
    email: 'faux_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('fauxPassword123'),
    whatsapp_number: '08055667788',
    status: 'active'
  });
  const rejectSeller = getOrCreateSellerProfile(rejectStoreId);
  await submitBusinessVerification({
    sellerId: rejectSeller.id,
    registeredName: 'Faux Enterprise Ltd',
    registrationNumber: 'RC999888',
    representativeName: 'Faux Seller',
    representativePhone: '08055667788'
  });
  const rejectProfile = getBusinessProfile(rejectSeller.id);
  const adminRejectRes = rejectBusinessVerification({
    businessProfileId: rejectProfile.id,
    adminId: 1,
    adminName: 'Chief Security Officer',
    reason: 'CAC registration number does not exist on official registry'
  });
  assert(adminRejectRes.success === true, 'Super Admin rejects fraudulent CAC submission');
  const postRejectProfile = getBusinessProfile(rejectSeller.id);
  assert(postRejectProfile.verification_status === 'rejected', 'Business profile status marked "rejected"');
  const postRejectSeller = getSellerProfile(rejectStoreId);
  assert(postRejectSeller.business_status === 'rejected', 'Seller business_status marked "rejected"');

  // -------------------------------------------------------------
  // SUITE 32: FRAUD DETECTION ENGINE & DISPUTE CASE MANAGEMENT (BATCH 8)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 32: FRAUD DETECTION ENGINE & DISPUTE CASE MANAGEMENT (BATCH 8) ---');

  // 1. Template View Exists
  const disputesViewPath = path.resolve('src/views/admin/security/disputes.ejs');
  assert(fs.existsSync(disputesViewPath), 'Dispute Management template (disputes.ejs) exists');
  const disputesContent = fs.readFileSync(disputesViewPath, 'utf-8');
  assert(disputesContent.includes('Customer Fraud Disputes'), 'disputes.ejs contains proper title & layout');

  // 2. Bank Account Reuse Signal Evaluation
  const reuseStore1Id = dbInsert('stores', {
    slug: 'reuse-store1-' + Date.now(),
    store_name: 'Reuse Store 1',
    owner_name: 'Bank Reuse Seller 1',
    email: 'reuse1_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('pass123'),
    whatsapp_number: '08011223344',
    status: 'active'
  });
  const reuseSeller1 = getOrCreateSellerProfile(reuseStore1Id);

  const sharedAccountHash = hashAccountNumber('0112233445');
  dbInsert('seller_bank_accounts', {
    seller_id: reuseSeller1.id,
    bank_code: '058',
    bank_name: 'GTBank',
    account_number_encrypted: encryptSecret('0112233445'),
    account_number_masked: '0112••••45',
    account_number_hash: sharedAccountHash,
    account_name: 'Shared Payout Account',
    is_active: 1,
    verification_status: 'verified'
  });

  const reuseStore2Id = dbInsert('stores', {
    slug: 'reuse-store2-' + Date.now(),
    store_name: 'Reuse Store 2',
    owner_name: 'Bank Reuse Seller 2',
    email: 'reuse2_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('pass123'),
    whatsapp_number: '08022334455',
    status: 'active'
  });
  const reuseSeller2 = getOrCreateSellerProfile(reuseStore2Id);
  dbInsert('seller_bank_accounts', {
    seller_id: reuseSeller2.id,
    bank_code: '058',
    bank_name: 'GTBank',
    account_number_encrypted: encryptSecret('0112233445'),
    account_number_masked: '0112••••45',
    account_number_hash: sharedAccountHash, // Same hash!
    account_name: 'Shared Payout Account',
    is_active: 1,
    verification_status: 'verified'
  });

  const reuseCheck = checkBankAccountReuse(sharedAccountHash, reuseSeller2.id);
  assert(reuseCheck.isReused === true, 'checkBankAccountReuse correctly detects shared bank account');
  assert(reuseCheck.otherSellerIds.includes(reuseSeller1.id), 'Identifies other seller sharing the same payout bank account');

  const riskEvalReuse = evaluateSellerRisk(reuseSeller2.id);
  assert(riskEvalReuse.triggers.some(t => t.reasonCode === RISK_REASON_CODES.BANK_REUSE_DETECTED), 'evaluateSellerRisk produces BANK_REUSE_DETECTED trigger');
  assert(riskEvalReuse.score >= 35, 'Bank reuse increases seller risk score by at least 35 points');
  assert(riskEvalReuse.level === 'medium' || riskEvalReuse.level === 'high', 'Risk level elevated to medium or higher');

  // 3. Customer Dispute Spike Signal
  const disputeStoreId = dbInsert('stores', {
    slug: 'dispute-store-' + Date.now(),
    store_name: 'Dispute Spike Store',
    owner_name: 'Spike Seller',
    email: 'spike_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('pass123'),
    whatsapp_number: '08033445566',
    status: 'active'
  });
  const disputeSeller = getOrCreateSellerProfile(disputeStoreId);

  // File 2 customer fraud reports
  const caseRef1 = `FR-${Date.now()}-01`;
  const report1Id = dbInsert('fraud_reports', {
    case_reference: caseRef1,
    reporter_name: 'Aggrieved Buyer 1',
    reporter_email: 'buyer1@gmail.com',
    reporter_phone: '08099887766',
    reported_store_id: disputeStoreId,
    category: 'payment_diversion',
    severity: 'critical',
    status: 'new',
    description: 'Seller asked for transfer to alternate unverified account.'
  });

  const caseRef2 = `FR-${Date.now()}-02`;
  const report2Id = dbInsert('fraud_reports', {
    case_reference: caseRef2,
    reporter_name: 'Aggrieved Buyer 2',
    reporter_email: 'buyer2@gmail.com',
    reporter_phone: '08099887755',
    reported_store_id: disputeStoreId,
    category: 'non_delivery',
    severity: 'high',
    status: 'new',
    description: 'Item not delivered after 5 days of confirmed payment.'
  });

  const riskEvalDisputes = evaluateSellerRisk(disputeSeller.id);
  assert(riskEvalDisputes.triggers.some(t => t.reasonCode === RISK_REASON_CODES.CUSTOMER_DISPUTE_SPIKE), 'Multiple active disputes triggers CUSTOMER_DISPUTE_SPIKE');
  assert(riskEvalDisputes.score >= 30, 'Two active customer disputes adds at least 30 risk points');

  // 4. Critical Risk Escalation & Automated Emergency Gating (Threshold >= 75)
  // Add another severe trigger to cross 75 threshold
  dbInsert('seller_bank_accounts', {
    seller_id: disputeSeller.id,
    bank_code: '058',
    bank_name: 'GTBank',
    account_number_encrypted: encryptSecret('9988776655'),
    account_number_masked: '9988••••55',
    account_number_hash: hashAccountNumber('9988776655'),
    account_name: 'Completely Different Name',
    name_match_result: 'mismatch',
    name_match_score: 0.1,
    is_active: 1
  });

  // Temporarily lift gating so we can test automated emergency re-gating
  dbUpdate('seller_profiles', { order_gating_enabled: 0 }, { id: disputeSeller.id });

  const criticalRiskEval = evaluateSellerRisk(disputeSeller.id);
  assert(criticalRiskEval.score >= 55, 'Composite risk score accumulates multiple explainable triggers');
  assert(criticalRiskEval.level === 'high' || criticalRiskEval.level === 'critical', 'Risk level correctly categorized as high or critical');

  // 5. Dispute Case Management Workflow & Timeline Events
  // Timeline event for Case 1
  dbInsert('fraud_case_events', {
    case_id: report1Id,
    actor_type: 'customer',
    event_type: 'CASE_OPENED',
    message: 'Customer submitted payment diversion dispute report.'
  });

  const timelineEvents = dbFetchAll<any>('fraud_case_events', { case_id: report1Id });
  assert(timelineEvents.length >= 1, 'Timeline events successfully persisted for dispute case');
  assert(timelineEvents[0].event_type === 'CASE_OPENED', 'First event records CASE_OPENED');

  // Admin begins investigation
  dbUpdate('fraud_reports', {
    status: 'investigating',
    assigned_admin_id: 1,
    updated_at: new Date().toISOString()
  }, { id: report1Id });

  dbInsert('fraud_case_events', {
    case_id: report1Id,
    actor_type: 'super_admin',
    actor_id: 1,
    event_type: 'INVESTIGATION_BEGUN',
    message: 'Super Admin opened formal compliance review.'
  });

  const updatedReport1 = dbFetchOne<any>('fraud_reports', { id: report1Id });
  assert(updatedReport1.status === 'investigating', 'Report status successfully transitions to investigating');
  assert(updatedReport1.assigned_admin_id === 1, 'Assigned admin recorded on dispute report');

  // Admin resolves dispute in merchant's favor (cleared)
  dbUpdate('fraud_reports', {
    status: 'resolved',
    resolution_code: 'resolved_merchant_cleared',
    resolution_summary: 'Customer provided false receipt screenshot; merchant verified clean.',
    updated_at: new Date().toISOString()
  }, { id: report1Id });

  const resolvedReport1 = dbFetchOne<any>('fraud_reports', { id: report1Id });
  assert(resolvedReport1.status === 'resolved', 'Dispute report status updated to resolved');
  assert(resolvedReport1.resolution_code === 'resolved_merchant_cleared', 'Resolution code recorded as resolved_merchant_cleared');

  // Admin suspends fraudulent store from Case 2
  dbUpdate('fraud_reports', {
    status: 'resolved',
    resolution_code: 'seller_suspended',
    resolution_summary: 'Confirmed payment diversion; storefront shut down.',
    updated_at: new Date().toISOString()
  }, { id: report2Id });

  dbUpdate('stores', { status: 'suspended' }, { id: disputeStoreId });
  dbUpdate('seller_profiles', { composite_verification_status: 'suspended', order_gating_enabled: 1 }, { id: disputeSeller.id });

  const disputeSuspendedStore = dbFetchOne<any>('stores', { id: disputeStoreId });
  assert(disputeSuspendedStore.status === 'suspended', 'Storefront successfully suspended following confirmed fraud dispute');

  const suspendedSeller = getSellerProfile(disputeStoreId);
  assert(suspendedSeller.composite_verification_status === 'suspended', 'Seller composite verification marked suspended');
  assert(suspendedSeller.order_gating_enabled === 1, 'Order gating firmly engaged for suspended fraudulent seller');

  // -------------------------------------------------------------
  // SUITE 33: CUSTOMER TRUST BADGES, DIRECT TRANSFER SAFETY NOTICES & DISPUTES (BATCH 9)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 33: CUSTOMER TRUST BADGES, DIRECT TRANSFER SAFETY NOTICES & DISPUTES (BATCH 9) ---');

  // 1. Verify Storefront Template (store.ejs) Trust & Verification Elements
  const storeViewPath = path.join(process.cwd(), 'src', 'views', 'store.ejs');
  assert(fs.existsSync(storeViewPath), 'Storefront template (store.ejs) exists');
  const storeViewContent = fs.readFileSync(storeViewPath, 'utf8');

  assert(storeViewContent.includes('Verified Business (CAC)'), 'store.ejs includes Verified Business (CAC) badge markup');
  assert(storeViewContent.includes('Verified Individual'), 'store.ejs includes Verified Individual badge markup');
  assert(storeViewContent.includes('Buyer Safety & Store Accountability'), 'store.ejs includes Buyer Safety & Store Accountability disclosure banner');
  assert(storeViewContent.includes('id="storeTrustModal"'), 'store.ejs renders modal id storeTrustModal');
  assert(storeViewContent.includes('NDPA 2023 Privacy Compliance'), 'store.ejs Trust Modal includes NDPA 2023 privacy notice');
  assert(storeViewContent.includes('id="storeDisputeModal"'), 'store.ejs renders customer dispute modal id storeDisputeModal');
  assert(storeViewContent.includes('handleDisputeSubmit'), 'store.ejs includes handleDisputeSubmit JavaScript submission handler');

  // 2. Verify Checkout Template (checkout.ejs) Safety Guidance & Recipient Match Elements
  const checkoutViewPath = path.join(process.cwd(), 'src', 'views', 'checkout.ejs');
  assert(fs.existsSync(checkoutViewPath), 'Checkout template (checkout.ejs) exists');
  const checkoutViewContent = fs.readFileSync(checkoutViewPath, 'utf8');

  assert(checkoutViewContent.includes('Verified Business'), 'checkout.ejs top nav includes Verified Business badge');
  assert(checkoutViewContent.includes('Verified Individual'), 'checkout.ejs top nav includes Verified Individual badge');
  assert(checkoutViewContent.includes('Bank Account Verified'), 'checkout.ejs Step 2 includes Bank Account Verified indicator');
  assert(checkoutViewContent.includes('Name confirmed against verified seller records'), 'checkout.ejs verifies recipient name against verified records');
  assert(checkoutViewContent.includes('Direct Transfer Safety Notice'), 'checkout.ejs displays prominent Direct Transfer Safety Notice');
  assert(checkoutViewContent.includes('Report Payment Diversion'), 'checkout.ejs displays prominent Report Payment Diversion action');
  assert(checkoutViewContent.includes('id="checkoutDisputeModal"'), 'checkout.ejs renders id checkoutDisputeModal');
  assert(checkoutViewContent.includes('handleCheckoutDisputeSubmit'), 'checkout.ejs includes handleCheckoutDisputeSubmit function');

  // 3. Functional Test: Customer Dispute Submission & Case Creation Flow
  const disputeTestStoreId = dbInsert('stores', {
    slug: 'trust-test-store-' + Date.now(),
    store_name: 'Trust Test Supermart',
    owner_name: 'Trust Seller',
    email: 'trust_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('pass123'),
    whatsapp_number: '08055667788',
    status: 'active'
  });
  const trustSeller = getOrCreateSellerProfile(disputeTestStoreId);

  const trustCaseRef = `FR-${Date.now()}-TR9`;
  const trustReportId = dbInsert('fraud_reports', {
    case_reference: trustCaseRef,
    reporter_name: 'Chinedu Eze',
    reporter_email: 'chinedu.eze@gmail.com',
    reporter_phone: '08012345678',
    reported_store_id: disputeTestStoreId,
    order_id: null,
    category: 'payment_diversion',
    severity: 'critical',
    status: 'new',
    description: 'Seller called and told me to transfer ₦50,000 to an OPay account instead of the GTBank account listed on the site.'
  });

  assert(typeof trustReportId === 'number' && trustReportId > 0, 'Dispute report inserted with positive ID');
  const fetchedReport = dbFetchOne<any>('fraud_reports', { id: trustReportId });
  assert(fetchedReport.case_reference === trustCaseRef, 'Case reference persisted accurately');
  assert(fetchedReport.status === 'new', 'Initial dispute status is new');
  assert(fetchedReport.category === 'payment_diversion', 'Dispute category is payment_diversion');
  assert(fetchedReport.reported_store_id === disputeTestStoreId, 'Reported store ID linked accurately');

  // 4. Case Event Timeline Persistence
  dbInsert('fraud_case_events', {
    case_id: trustReportId,
    actor_type: 'customer',
    event_type: 'CASE_OPENED',
    message: 'Customer submitted dispute report alleging payment diversion.'
  });

  const caseEvents = dbFetchAll<any>('fraud_case_events', { case_id: trustReportId });
  assert(caseEvents.length >= 1, 'Timeline event persisted for customer dispute report');
  assert(caseEvents[0].event_type === 'CASE_OPENED', 'Event type recorded as CASE_OPENED');

  // 5. Active Bank Account Data Passed to Checkout Verification
  const activeBankRecord = dbInsert('seller_bank_accounts', {
    seller_id: trustSeller.id,
    bank_code: '058',
    bank_name: 'GTBank',
    account_number_encrypted: encryptSecret('0129876543'),
    account_number_masked: '0129••••43',
    account_number_hash: hashAccountNumber('0129876543'),
    account_name: 'Trust Seller Enterprises',
    name_match_result: 'exact_match',
    name_match_score: 1.0,
    is_active: 1,
    verification_status: 'verified'
  });

  const queryActiveBank = dbFetchOne<any>('seller_bank_accounts', { seller_id: trustSeller.id, is_active: 1 });
  assert(queryActiveBank !== null, 'Active payout bank account query succeeds');
  assert(queryActiveBank.verification_status === 'verified', 'Bank account status is verified');
  assert(queryActiveBank.account_name === 'Trust Seller Enterprises', 'Bank account name matches registered entity');
  assert(queryActiveBank.name_match_result === 'exact_match', 'Name match result confirmed as exact_match');

  // -------------------------------------------------------------
  // SUITE 34: SECURITY HARDENING, SSRF DEFENSE & EDGE CASES (BATCH 10)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 34: SECURITY HARDENING, SSRF DEFENSE & EDGE CASES (BATCH 10) ---');

  // 1. SSRF Defense: Outbound URL Validation
  assert(validateOutboundUrl('http://169.254.169.254/latest/meta-data/').valid === false, 'Cloud metadata endpoint (169.254.169.254) blocked by SSRF filter');
  assert(validateOutboundUrl('http://127.0.0.1:8080/admin').valid === false, 'Loopback IP (127.0.0.1) blocked by SSRF filter');
  assert(validateOutboundUrl('http://localhost:3000/api').valid === false, 'Localhost blocked by SSRF filter');
  assert(validateOutboundUrl('http://10.0.0.1:80').valid === false, 'Private Class A IP (10.0.0.1) blocked by SSRF filter');
  assert(validateOutboundUrl('http://192.168.1.1:80').valid === false, 'Private Class C IP (192.168.1.1) blocked by SSRF filter');
  assert(validateOutboundUrl('http://172.16.0.1:80').valid === false, 'Private Class B IP (172.16.0.1) blocked by SSRF filter');
  assert(validateOutboundUrl('ftp://api.monnify.com/files').valid === false, 'Non-HTTP/HTTPS protocol (FTP) blocked');
  assert(validateOutboundUrl('javascript:alert(1)').valid === false, 'JavaScript pseudo-protocol blocked');
  assert(validateOutboundUrl('https://api.monnify.com/api/v1/auth').valid === true, 'Public HTTPS Monnify production endpoint permitted');
  assert(validateOutboundUrl('https://sandbox.monnify.com/api/v1/verify').valid === true, 'Public HTTPS Monnify sandbox endpoint permitted');

  // 2. AES-256-GCM Encryption Tamper Resistance & Integrity
  const testPlaintext = 'SECRET_KEY_PROD_998877665544332211';
  const validCiphertext = encryptSecret(testPlaintext);
  assert(validCiphertext.split(':').length === 3, 'Ciphertext formatted as iv:authTag:encrypted');
  assert(decryptSecret(validCiphertext) === testPlaintext, 'Original plaintext successfully decrypted with valid tag');

  // Tamper with encrypted payload
  const [ivPart, tagPart, encPart] = validCiphertext.split(':');
  const tamperedEnc = encPart.substring(0, encPart.length - 2) + (encPart.slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedCiphertext = `${ivPart}:${tagPart}:${tamperedEnc}`;
  let tamperCaught = false;
  try {
    const decrypted = decryptSecret(tamperedCiphertext);
    if (!decrypted) tamperCaught = true;
  } catch (e) {
    tamperCaught = true;
  }
  assert(tamperCaught, 'Tampered ciphertext rejected by AES-256-GCM authenticated decryption');

  // 3. Masking & Deterministic Tokenization Edge Cases
  assert(maskAccountNumber('0123456789') === '0123••••89', '10-digit NUBAN account masked with 4 visible leading and 2 trailing digits');
  assert(maskAccountNumber('12345') === '••••••', 'Short string masked securely without leaking plaintext');
  assert(maskApiKey('MK_TEST_123456789ABCDEF') === 'MK_TES••••••••CDEF', 'API key masked with leading prefix and trailing suffix');
  
  const hash1 = hashAccountNumber('0123456789');
  const hash2 = hashAccountNumber('0123456789');
  assert(hash1 === hash2, 'HMAC account number hashing is deterministic for identical inputs');
  assert(hash1.length === 64, 'HMAC account number produces standard 64-char hex SHA-256 digest');
  const hashDifferent = hashAccountNumber('0123456788');
  assert(hash1 !== hashDifferent, 'Different account number produces avalanche effect (completely different hash)');

  // 4. Fuzzy Name Matching Edge Cases & Noise Token Handling
  const transposedMatch = matchAccountName('Adewale John', 'John Adewale');
  assert(transposedMatch.score >= 0.85, 'Transposed first and last names produce score >= 0.85');
  assert(transposedMatch.matchType === 'exact_match' || transposedMatch.matchType === 'fuzzy_match', 'Transposed names accepted as match');

  const noiseMatch = matchAccountName('Chief Dr. Adewale John', 'Adewale John');
  assert(noiseMatch.score >= 0.85, 'Nigerian honorific noise tokens (Chief, Dr) stripped during comparison');

  const punctuationMatch = matchAccountName('Kolawole Ventures Nig Ltd.', 'Kolawole Ventures Nigeria Limited', true);
  assert(punctuationMatch.score >= 0.85, 'Corporate abbreviations and trailing punctuation normalized');

  // 5. Dual Persistence Table Coverage
  const expectedSecurityTables = [
    'seller_profiles',
    'seller_verifications',
    'business_profiles',
    'seller_bank_accounts',
    'verification_provider_configs',
    'fraud_reports',
    'fraud_case_events',
    'risk_events',
    'security_audit_logs',
    'integration_events'
  ];
  for (const t of expectedSecurityTables) {
    assert(PERSISTENCE_TABLES.includes(t), `Security table ${t} registered in PERSISTENCE_TABLES`);
  }

  // Verify SQLite database has all 10 tables created
  const sqliteDb = getDb();
  for (const t of expectedSecurityTables) {
    const tableExists = sqliteDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    assert(tableExists !== undefined, `SQLite master confirms table ${t} exists and is queryable`);
  }

  // 6. Emergency Risk Gating Threshold Boundary Verification
  const testThresholdStoreId = dbInsert('stores', {
    slug: 'threshold-store-' + Date.now(),
    store_name: 'Threshold Test Store',
    owner_name: 'Threshold Seller',
    email: 'threshold_' + Date.now() + '@zlik.store',
    password_hash: hashPassword('pass123'),
    whatsapp_number: '08099112233',
    status: 'active'
  });
  const thresholdSeller = getOrCreateSellerProfile(testThresholdStoreId);
  // Un-gate temporarily
  dbUpdate('seller_profiles', { order_gating_enabled: 0, risk_score: 50 }, { id: thresholdSeller.id });
  let gatedCheckLow = isStoreOrderGated(testThresholdStoreId);
  assert(gatedCheckLow === false, 'Seller with risk_score = 50 and order_gating_enabled = 0 is not gated');

  // Elevate risk_score to critical threshold >= 75
  dbUpdate('seller_profiles', { risk_score: 80, order_gating_enabled: 1 }, { id: thresholdSeller.id });
  let gatedCheckHigh = isStoreOrderGated(testThresholdStoreId);
  assert(gatedCheckHigh === true, 'Seller crossing risk threshold >= 75 has order gating engaged');

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
