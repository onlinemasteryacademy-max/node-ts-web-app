import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { normalizePhoneNumber, hashPassword, comparePassword, validateStoreSlugAvailability, getPlatformSettings, getEffectivePlans } from '../../utils/helpers.js';
import { sendEmailVerificationOtp, sendMerchantWelcomeEmail } from '../email/mailer.js';

const OTP_LIFETIME_SECONDS = 300; // 5 minutes validity

function parseDateMs(dateStr: string | number | Date | null | undefined): number {
  if (!dateStr) return 0;
  if (typeof dateStr === 'number') return dateStr;
  if (dateStr instanceof Date) return dateStr.getTime();
  const s = String(dateStr).trim();
  if (s.endsWith('Z')) return new Date(s).getTime();
  if (s.includes('T')) return new Date(s + 'Z').getTime();
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * 1. Initiate Merchant Registration (Generates 6-Digit Email OTP)
   */
  fastify.post('/api/auth/signup/initiate', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const storeName = body.store_name?.trim();
    const ownerName = body.owner_name?.trim() || storeName;
    const email = body.email?.toLowerCase().trim();
    const phone = body.whatsapp_number?.trim() || body.phone?.trim();
    const pin = (body.pin || body.password || '').trim();
    const rawSlug = body.slug || storeName;
    const planTier = (body.plan_tier || 'free').toLowerCase();
    const billingCycle = (body.billing_cycle || 'monthly').toLowerCase();

    if (!storeName || !phone || !pin || !email) {
      return reply.send({ success: false, error: 'Store name, full name, email, WhatsApp number, and 5-digit PIN are required' });
    }

    if (!/^\d{5}$/.test(pin)) {
      return reply.send({ success: false, error: 'Security PIN must be exactly 5 digits (e.g. 12345)' });
    }

    if (!email.includes('@') || !email.includes('.')) {
      return reply.send({ success: false, error: 'Please enter a valid email address' });
    }

    // Validate username / slug uniqueness & reservation
    const slugCheck = validateStoreSlugAvailability(rawSlug);
    if (!slugCheck.valid) {
      return reply.send({ success: false, error: slugCheck.error });
    }
    const slug = slugCheck.normalizedSlug;

    // Check if an active store with this email already exists
    const existingStoreByEmail = dbFetchOne<any>('stores', { email, status: 'active' });
    if (existingStoreByEmail) {
      return reply.send({ success: false, error: 'A store account with this email address already exists. Please sign in.' });
    }

    // Check if an active store with this phone already exists
    const phoneNorm = normalizePhoneNumber(phone);
    const allStores = dbFetchAll<any>('stores', { status: 'active' });
    const existingStoreByPhone = allStores.find(s => {
      const sNorm = normalizePhoneNumber(s.whatsapp_number);
      return sNorm === phoneNorm || (phoneNorm && sNorm.endsWith(phoneNorm.slice(-10)));
    });
    if (existingStoreByPhone) {
      return reply.send({ success: false, error: 'A store account with this WhatsApp number already exists. Please sign in.' });
    }

    // Generate cryptographically secure 6-digit numeric OTP and token
    const otpCode = String(crypto.randomInt(100000, 999999));
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    const token = crypto.randomUUID();
    const passHash = await hashPassword(pin);
    const nowMs = Date.now();
    const expiresAt = new Date(nowMs + OTP_LIFETIME_SECONDS * 1000).toISOString();

    const pendingPayload = {
      slug,
      store_name: storeName,
      owner_name: ownerName,
      email,
      password_hash: passHash,
      whatsapp_number: phone,
      plan_tier: planTier,
      billing_cycle: billingCycle,
      industry_id: parseInt(body.industry_id || '1'),
      template_id: parseInt(body.template_id || '1'),
      template_slug: body.template_slug || 'modern_grid',
      business_type: body.business_type || 'retail'
    };

    // Save pending verification record
    dbInsert('email_verifications', {
      email,
      otp_hash: otpHash,
      token,
      payload_json: JSON.stringify(pendingPayload),
      attempts: 0,
      expires_at: expiresAt,
      used: 0,
      created_at: new Date(nowMs).toISOString()
    });

    // Send Verification Email
    const verifyUrl = `${req.protocol}://${req.hostname}/verify-email?token=${token}&code=${otpCode}`;
    await sendEmailVerificationOtp(email, ownerName, otpCode, verifyUrl);

    return reply.send({
      success: true,
      token,
      email,
      plan_tier: planTier,
      billing_cycle: billingCycle,
      expires_in: OTP_LIFETIME_SECONDS,
      message: 'A 6-digit verification code has been sent to your email.'
    });
  });

  /**
   * 2. Verify Email OTP & Provision Store Account (With Tiered Branching)
   */
  fastify.post('/api/auth/signup/verify', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const token = body.token?.trim();
    const email = body.email?.toLowerCase().trim();
    const otpCode = String(body.otp_code || '').trim();

    if (!otpCode) {
      return reply.send({ success: false, error: 'Please enter the 6-digit verification code' });
    }

    let verif: any = null;
    if (token) {
      verif = dbFetchOne<any>('email_verifications', { token, used: 0 });
    } else if (email) {
      const rows = dbFetchAll<any>('email_verifications', { email, used: 0 });
      verif = rows.sort((a, b) => b.id - a.id)[0];
    }

    if (!verif) {
      return reply.send({ success: false, error: 'Verification request not found or has expired. Please initiate registration again.' });
    }

    // Check expiration using safe UTC timestamp comparison
    const expiryMs = parseDateMs(verif.expires_at);
    if (Date.now() > expiryMs) {
      return reply.send({ success: false, error: 'Verification code has expired. Please request a new code.' });
    }

    // Check brute force attempts limit
    if ((verif.attempts || 0) >= 5) {
      return reply.send({ success: false, error: 'Too many incorrect attempts. Please request a new verification code.' });
    }

    // Check hash - strictly matches the 6-digit code sent to the email
    const inputHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    if (inputHash !== verif.otp_hash) {
      dbUpdate('email_verifications', { attempts: (verif.attempts || 0) + 1 }, { id: verif.id });
      const remaining = 4 - (verif.attempts || 0);
      return reply.send({ 
        success: false, 
        error: remaining > 0 ? `Incorrect verification code. ${remaining} attempt(s) remaining.` : 'Too many incorrect attempts. Please request a new code.' 
      });
    }

    // Mark as verified
    dbUpdate('email_verifications', { used: 1 }, { id: verif.id });

    // Parse pending registration data
    const payload = JSON.parse(verif.payload_json);
    const slug = payload.slug;

    // Archive any old deleted store with the same slug
    const deletedStore = dbFetchOne<any>('stores', { slug, status: 'deleted' });
    if (deletedStore) {
      dbUpdate('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
    }

    const now = new Date();
    const isPaidPlan = payload.plan_tier === 'pro' || payload.plan_tier === 'business';

    // Insert Store Record
    const storeId = dbInsert('stores', {
      slug: payload.slug,
      store_name: payload.store_name,
      owner_name: payload.owner_name,
      email: payload.email,
      password_hash: payload.password_hash,
      whatsapp_number: payload.whatsapp_number,
      template_type: payload.template_slug || 'modern_grid',
      bio: `Welcome to ${payload.store_name}! Order your favorite items directly with instant delivery.`,
      currency_symbol: '₦',
      bank_name: null,
      bank_account_number: null,
      bank_account_name: null,
      payment_instructions: 'Please transfer to our bank account and provide the reference code.',
      delivery_fee: 0,
      delivery_fee_type: 'fixed',
      primary_color: '#08110D',
      alert_sound: 'chime',
      plan_tier: 'free', // Free until paid if pro/business
      status: 'active',
      business_type: payload.business_type || 'retail',
      industry_id: payload.industry_id || 1,
      template_id: payload.template_id || 1,
      template_slug: payload.template_slug || 'modern_grid',
      receipt_template: 'standard',
      email_verified: 1,
      subscription_status: isPaidPlan ? 'pending_payment' : 'active',
      billing_cycle: payload.billing_cycle || 'monthly',
      is_trial_active: 0,
      trial_ends_at: null,
      created_at: now.toISOString().slice(0, 19).replace('T', ' '),
      updated_at: now.toISOString().slice(0, 19).replace('T', ' ')
    });

    const newStore = dbFetchOne<any>('stores', { id: storeId });
    (req as any).session.merchantStore = newStore;

    // ==========================================
    // Free Plan Branch -> Instant Launch
    // ==========================================
    if (!isPaidPlan) {
      sendMerchantWelcomeEmail(newStore).catch(() => {});
      return reply.send({
        success: true,
        requires_payment: false,
        store: newStore,
        redirect: '/merchant'
      });
    }

    // ==========================================
    // Paid Plan Branch -> Initialize Paystack Payment
    // ==========================================
    const settings = getPlatformSettings();
    let amount = 5000;
    if (payload.plan_tier === 'pro') {
      amount = payload.billing_cycle === 'yearly' 
        ? Number(settings.pro_yearly_price || 50000) 
        : Number(settings.pro_monthly_price || 5000);
    } else if (payload.plan_tier === 'business') {
      amount = payload.billing_cycle === 'yearly' 
        ? Number(settings.business_yearly_price || 90000) 
        : Number(settings.business_monthly_price || 9000);
    }

    const reference = `sub_${storeId}_${Date.now()}`;
    dbInsert('subscription_payments', {
      store_id: storeId,
      email: payload.email,
      reference,
      plan_tier: payload.plan_tier,
      billing_cycle: payload.billing_cycle || 'monthly',
      amount,
      currency: 'NGN',
      gateway: 'paystack',
      status: 'pending',
      metadata_json: JSON.stringify({
        store_id: storeId,
        store_slug: newStore.slug,
        store_name: newStore.store_name,
        plan_tier: payload.plan_tier,
        billing_cycle: payload.billing_cycle
      }),
      created_at: now.toISOString().slice(0, 19).replace('T', ' ')
    });

    const paystackMode = (settings.paystack_mode || 'test').toLowerCase();
    const isLive = paystackMode === 'live';
    const paystackPublicKey = isLive 
      ? (settings.paystack_live_public_key || '').trim() 
      : (settings.paystack_test_public_key || 'pk_test_sample').trim();

    return reply.send({
      success: true,
      requires_payment: true,
      store_id: storeId,
      store_slug: newStore.slug,
      plan_tier: payload.plan_tier,
      billing_cycle: payload.billing_cycle || 'monthly',
      amount,
      amount_kobo: Math.round(amount * 100),
      reference,
      paystack_public_key: paystackPublicKey,
      email: payload.email,
      owner_name: newStore.owner_name
    });
  });

  /**
   * 3. Resend Email OTP (Refreshes 5-Minute Code)
   */
  fastify.post('/api/auth/signup/resend_otp', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const token = body.token?.trim();
    const email = body.email?.toLowerCase().trim();

    let verif: any = null;
    if (token) {
      verif = dbFetchOne<any>('email_verifications', { token, used: 0 });
    } else if (email) {
      const rows = dbFetchAll<any>('email_verifications', { email, used: 0 });
      verif = rows.sort((a, b) => b.id - a.id)[0];
    }

    if (!verif) {
      return reply.send({ success: false, error: 'No active signup session found. Please start registration again.' });
    }

    const payload = JSON.parse(verif.payload_json);
    const newOtp = String(crypto.randomInt(100000, 999999));
    const newHash = crypto.createHash('sha256').update(newOtp).digest('hex');
    const nowMs = Date.now();
    const expiresAt = new Date(nowMs + OTP_LIFETIME_SECONDS * 1000).toISOString();

    dbUpdate('email_verifications', {
      otp_hash: newHash,
      attempts: 0,
      expires_at: expiresAt,
      created_at: new Date(nowMs).toISOString()
    }, { id: verif.id });

    const verifyUrl = `${req.protocol}://${req.hostname}/verify-email?token=${verif.token}&code=${newOtp}`;
    await sendEmailVerificationOtp(verif.email, payload.owner_name, newOtp, verifyUrl);

    return reply.send({ 
      success: true, 
      expires_in: OTP_LIFETIME_SECONDS,
      message: 'A fresh 6-digit verification code has been sent to your email.' 
    });
  });

  /**
   * 4. Magic Link Verification Route
   */
  fastify.get('/verify-email', async (req: FastifyRequest<{ Querystring: { token?: string; code?: string } }>, reply: FastifyReply) => {
    const token = req.query.token?.trim();
    const code = req.query.code?.trim();

    if (!token || !code) {
      return reply.redirect('/?error=invalid_verification_link');
    }

    const verif = dbFetchOne<any>('email_verifications', { token, used: 0 });
    if (!verif) {
      return reply.redirect('/?error=verification_session_not_found');
    }

    const expiryMs = parseDateMs(verif.expires_at);
    if (Date.now() > expiryMs) {
      return reply.redirect('/?error=verification_link_expired');
    }

    const inputHash = crypto.createHash('sha256').update(code).digest('hex');
    if (inputHash !== verif.otp_hash) {
      return reply.redirect('/?error=invalid_verification_code');
    }

    // Mark as used
    dbUpdate('email_verifications', { used: 1 }, { id: verif.id });
    const payload = JSON.parse(verif.payload_json);
    const slug = payload.slug;

    // Archive any old deleted store
    const deletedStore = dbFetchOne<any>('stores', { slug, status: 'deleted' });
    if (deletedStore) {
      dbUpdate('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
    }

    const now = new Date();
    const isPaidPlan = payload.plan_tier === 'pro' || payload.plan_tier === 'business';

    const storeId = dbInsert('stores', {
      slug: payload.slug,
      store_name: payload.store_name,
      owner_name: payload.owner_name,
      email: payload.email,
      password_hash: payload.password_hash,
      whatsapp_number: payload.whatsapp_number,
      template_type: payload.template_slug || 'modern_grid',
      bio: `Welcome to ${payload.store_name}! Order your favorite items directly with instant delivery.`,
      currency_symbol: '₦',
      plan_tier: isPaidPlan ? 'free' : 'free',
      status: 'active',
      business_type: payload.business_type || 'retail',
      industry_id: payload.industry_id || 1,
      template_id: payload.template_id || 1,
      template_slug: payload.template_slug || 'modern_grid',
      receipt_template: 'standard',
      email_verified: 1,
      subscription_status: isPaidPlan ? 'pending_payment' : 'active',
      billing_cycle: payload.billing_cycle || 'monthly',
      created_at: now.toISOString().slice(0, 19).replace('T', ' '),
      updated_at: now.toISOString().slice(0, 19).replace('T', ' ')
    });

    const newStore = dbFetchOne<any>('stores', { id: storeId });
    (req as any).session.merchantStore = newStore;

    if (!isPaidPlan) {
      sendMerchantWelcomeEmail(newStore).catch(() => {});
      return reply.redirect('/merchant?verified=1');
    } else {
      return reply.redirect(`/merchant/settings?checkout=1&plan=${payload.plan_tier}&cycle=${payload.billing_cycle || 'monthly'}`);
    }
  });

  /**
   * 5. Direct / Automated Merchant Registration (Compatibility / Testing endpoint)
   */
  fastify.post('/api/auth/register', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const storeName = body.store_name?.trim();
    const ownerName = body.owner_name?.trim() || storeName;
    const email = body.email?.toLowerCase().trim() || null;
    const phone = body.whatsapp_number?.trim() || body.phone?.trim();
    const pin = (body.pin || body.password || '').trim();
    const rawSlug = body.slug || storeName;

    if (!storeName || !phone || !pin) {
      return reply.send({ success: false, error: 'Store name, WhatsApp phone number, and 5-digit PIN are required' });
    }

    if (!/^\d{5}$/.test(pin)) {
      return reply.send({ success: false, error: 'Security PIN must be exactly 5 digits' });
    }

    // Validate username / slug uniqueness & reservation
    const slugCheck = validateStoreSlugAvailability(rawSlug);
    if (!slugCheck.valid) {
      return reply.send({ success: false, error: slugCheck.error });
    }
    const slug = slugCheck.normalizedSlug;

    const deletedStore = dbFetchOne<any>('stores', { slug, status: 'deleted' });
    if (deletedStore) {
      dbUpdate('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
    }

    const passHash = await hashPassword(pin);
    const now = new Date();

    const storeId = dbInsert('stores', {
      slug,
      store_name: storeName,
      owner_name: ownerName,
      email,
      password_hash: passHash,
      whatsapp_number: phone,
      template_type: body.template_slug || 'modern_grid',
      bio: `Welcome to ${storeName}! Order your favorite items directly with instant delivery.`,
      currency_symbol: '₦',
      plan_tier: body.plan_tier || 'free',
      status: 'active',
      business_type: body.business_type || 'retail',
      industry_id: parseInt(body.industry_id || '1'),
      template_id: parseInt(body.template_id || '1'),
      template_slug: body.template_slug || 'modern_grid',
      receipt_template: 'standard',
      email_verified: 1,
      subscription_status: 'active',
      billing_cycle: body.billing_cycle || 'monthly',
      created_at: now.toISOString().slice(0, 19).replace('T', ' '),
      updated_at: now.toISOString().slice(0, 19).replace('T', ' ')
    });

    const newStore = dbFetchOne<any>('stores', { id: storeId });
    (req as any).session.merchantStore = newStore;

    return reply.send({ success: true, store: newStore, redirect: '/merchant' });
  });

  /**
   * 6. Merchant Dual Login (Email OR WhatsApp Phone with 5-Digit PIN)
   */
  fastify.post('/api/auth/login', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const identifier = body.identifier?.trim() || body.email?.trim();
    const pin = (body.pin || body.password || '').trim();

    if (!identifier || !pin) {
      return reply.send({ success: false, error: 'Please enter your email or WhatsApp number and 5-digit PIN' });
    }

    let store: any = null;

    // 1. Try Email
    if (identifier.includes('@')) {
      store = dbFetchOne<any>('stores', { email: identifier.toLowerCase() });
    }

    // 2. Try Phone
    if (!store) {
      const phoneNorm = normalizePhoneNumber(identifier);
      const allStores = dbFetchAll<any>('stores');
      store = allStores.find(s => {
        const sNorm = normalizePhoneNumber(s.whatsapp_number);
        return sNorm === phoneNorm || (phoneNorm && sNorm.endsWith(phoneNorm.slice(-10)));
      });
    }

    if (!store) {
      return reply.send({ success: false, error: 'No store account found with this email or phone number' });
    }

    const matches = await comparePassword(pin, store.password_hash);
    if (!matches) {
      return reply.send({ success: false, error: 'Incorrect 5-digit PIN' });
    }

    (req as any).session.merchantStore = store;
    return reply.send({ success: true, store, redirect: '/merchant' });
  });

  /**
   * 7. Merchant Logout
   */
  fastify.get('/merchant/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    (req as any).session.merchantStore = null;
    return reply.redirect('/merchant/login');
  });

  /**
   * 8. Super Admin Login (Compatibility Route)
   */
  fastify.post('/api/auth/admin_login', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const email = body.email?.toLowerCase().trim();
    const password = body.password;

    const admin = dbFetchOne<any>('super_admins', { email });
    if (!admin) {
      return reply.send({ success: false, error: 'Invalid admin credentials' });
    }

    const matches = await comparePassword(password, admin.password_hash);
    if (!matches) {
      return reply.send({ success: false, error: 'Invalid admin credentials' });
    }

    (req as any).session.admin_id = admin.id;
    (req as any).session.admin_name = admin.name;
    (req as any).session.admin_role = admin.role;
    (req as any).session.superAdmin = admin;

    dbUpdate('super_admins', {
      last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      last_login_ip: req.ip
    }, { id: admin.id });

    return reply.send({ success: true, redirect: '/admin' });
  });
}

