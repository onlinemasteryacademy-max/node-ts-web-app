"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const node_crypto_1 = __importDefault(require("node:crypto"));
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const storeNameValidator_js_1 = require("../../utils/storeNameValidator.js");
const mailer_js_1 = require("../email/mailer.js");
const affiliateService_js_1 = require("../affiliates/affiliateService.js");
const OTP_LIFETIME_SECONDS = 300; // 5 minutes validity
function parseDateMs(dateStr) {
    if (!dateStr)
        return 0;
    if (typeof dateStr === 'number')
        return dateStr;
    if (dateStr instanceof Date)
        return dateStr.getTime();
    const s = String(dateStr).trim();
    if (s.endsWith('Z'))
        return new Date(s).getTime();
    if (s.includes('T'))
        return new Date(s + 'Z').getTime();
    return new Date(s.replace(' ', 'T') + 'Z').getTime();
}
async function authRoutes(fastify) {
    /**
     * 1. Initiate Merchant Registration (Generates 6-Digit Email OTP)
     */
    fastify.post('/api/auth/signup/initiate', async (req, reply) => {
        const body = (req.body || {});
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
        // Validate store name against Zlik Trust & Security rules
        const nameCheck = (0, storeNameValidator_js_1.validateStoreName)(storeName, 'personal', false);
        if (!nameCheck.valid) {
            return reply.send({ success: false, error: nameCheck.reason });
        }
        // Validate username / slug uniqueness & reservation
        const slugCheck = (0, helpers_js_1.validateStoreSlugAvailability)(rawSlug);
        if (!slugCheck.valid) {
            return reply.send({ success: false, error: slugCheck.error });
        }
        const slug = slugCheck.normalizedSlug;
        // Check if an active store with this email already exists
        const existingStoreByEmail = (0, db_js_1.dbFetchOne)('stores', { email, status: 'active' });
        if (existingStoreByEmail) {
            return reply.send({ success: false, error: 'A store account with this email address already exists. Please sign in.' });
        }
        // Check if an active store with this phone already exists
        const phoneNorm = (0, helpers_js_1.normalizePhoneNumber)(phone);
        const allStores = (0, db_js_1.dbFetchAll)('stores', { status: 'active' });
        const existingStoreByPhone = allStores.find(s => {
            const sNorm = (0, helpers_js_1.normalizePhoneNumber)(s.whatsapp_number);
            return sNorm === phoneNorm || (phoneNorm && sNorm.endsWith(phoneNorm.slice(-10)));
        });
        if (existingStoreByPhone) {
            return reply.send({ success: false, error: 'A store account with this WhatsApp number already exists. Please sign in.' });
        }
        // Generate cryptographically secure 6-digit numeric OTP and token
        const otpCode = String(node_crypto_1.default.randomInt(100000, 999999));
        const otpHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        const token = node_crypto_1.default.randomUUID();
        const passHash = await (0, helpers_js_1.hashPassword)(pin);
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
            business_type: body.business_type || 'retail',
            ref_code: (body.ref_code || req.cookies?.zlik_aff || '').trim()
        };
        // Save pending verification record
        (0, db_js_1.dbInsert)('email_verifications', {
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
        await (0, mailer_js_1.sendEmailVerificationOtp)(email, ownerName, otpCode, verifyUrl);
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
    fastify.post('/api/auth/signup/verify', async (req, reply) => {
        const body = (req.body || {});
        const token = body.token?.trim();
        const email = body.email?.toLowerCase().trim();
        const otpCode = String(body.otp_code || '').trim();
        if (!otpCode) {
            return reply.send({ success: false, error: 'Please enter the 6-digit verification code' });
        }
        let verif = null;
        if (token) {
            verif = (0, db_js_1.dbFetchOne)('email_verifications', { token, used: 0 });
        }
        else if (email) {
            const rows = (0, db_js_1.dbFetchAll)('email_verifications', { email, used: 0 });
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
        const inputHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        if (inputHash !== verif.otp_hash) {
            (0, db_js_1.dbUpdate)('email_verifications', { attempts: (verif.attempts || 0) + 1 }, { id: verif.id });
            const remaining = 4 - (verif.attempts || 0);
            return reply.send({
                success: false,
                error: remaining > 0 ? `Incorrect verification code. ${remaining} attempt(s) remaining.` : 'Too many incorrect attempts. Please request a new code.'
            });
        }
        // Mark as verified
        (0, db_js_1.dbUpdate)('email_verifications', { used: 1 }, { id: verif.id });
        // Parse pending registration data
        const payload = JSON.parse(verif.payload_json);
        const slug = payload.slug;
        // Archive any old deleted store with the same slug
        const deletedStore = (0, db_js_1.dbFetchOne)('stores', { slug, status: 'deleted' });
        if (deletedStore) {
            (0, db_js_1.dbUpdate)('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
        }
        const now = new Date();
        const isPaidPlan = payload.plan_tier === 'pro' || payload.plan_tier === 'business';
        // Insert Store Record
        const storeId = (0, db_js_1.dbInsert)('stores', {
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
        const newStore = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
        req.session.merchantStore = newStore;
        // Bind Affiliate Referral if cookie or payload has referral code
        const effectiveRefCode = payload.ref_code || req.cookies?.zlik_aff;
        if (effectiveRefCode) {
            try {
                (0, affiliateService_js_1.bindReferredStore)(storeId, effectiveRefCode, req.cookies?.zlik_aff_session);
            }
            catch (err) { }
        }
        // ==========================================
        // Free Plan Branch -> Instant Launch
        // ==========================================
        if (!isPaidPlan) {
            (0, mailer_js_1.sendMerchantWelcomeEmail)(newStore).catch(() => { });
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
        const settings = (0, helpers_js_1.getPlatformSettings)();
        let amount = 5000;
        if (payload.plan_tier === 'pro') {
            amount = payload.billing_cycle === 'yearly'
                ? Number(settings.pro_yearly_price || 50000)
                : Number(settings.pro_monthly_price || 5000);
        }
        else if (payload.plan_tier === 'business') {
            amount = payload.billing_cycle === 'yearly'
                ? Number(settings.business_yearly_price || 90000)
                : Number(settings.business_monthly_price || 9000);
        }
        const reference = `sub_${storeId}_${Date.now()}`;
        (0, db_js_1.dbInsert)('subscription_payments', {
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
    fastify.post('/api/auth/signup/resend_otp', async (req, reply) => {
        const body = (req.body || {});
        const token = body.token?.trim();
        const email = body.email?.toLowerCase().trim();
        let verif = null;
        if (token) {
            verif = (0, db_js_1.dbFetchOne)('email_verifications', { token, used: 0 });
        }
        else if (email) {
            const rows = (0, db_js_1.dbFetchAll)('email_verifications', { email, used: 0 });
            verif = rows.sort((a, b) => b.id - a.id)[0];
        }
        if (!verif) {
            return reply.send({ success: false, error: 'No active signup session found. Please start registration again.' });
        }
        const payload = JSON.parse(verif.payload_json);
        const newOtp = String(node_crypto_1.default.randomInt(100000, 999999));
        const newHash = node_crypto_1.default.createHash('sha256').update(newOtp).digest('hex');
        const nowMs = Date.now();
        const expiresAt = new Date(nowMs + OTP_LIFETIME_SECONDS * 1000).toISOString();
        (0, db_js_1.dbUpdate)('email_verifications', {
            otp_hash: newHash,
            attempts: 0,
            expires_at: expiresAt,
            created_at: new Date(nowMs).toISOString()
        }, { id: verif.id });
        const verifyUrl = `${req.protocol}://${req.hostname}/verify-email?token=${verif.token}&code=${newOtp}`;
        await (0, mailer_js_1.sendEmailVerificationOtp)(verif.email, payload.owner_name, newOtp, verifyUrl);
        return reply.send({
            success: true,
            expires_in: OTP_LIFETIME_SECONDS,
            message: 'A fresh 6-digit verification code has been sent to your email.'
        });
    });
    /**
     * 4. Magic Link Verification Route
     */
    fastify.get('/verify-email', async (req, reply) => {
        const token = req.query.token?.trim();
        const code = req.query.code?.trim();
        if (!token || !code) {
            return reply.redirect('/?error=invalid_verification_link');
        }
        const verif = (0, db_js_1.dbFetchOne)('email_verifications', { token, used: 0 });
        if (!verif) {
            return reply.redirect('/?error=verification_session_not_found');
        }
        const expiryMs = parseDateMs(verif.expires_at);
        if (Date.now() > expiryMs) {
            return reply.redirect('/?error=verification_link_expired');
        }
        const inputHash = node_crypto_1.default.createHash('sha256').update(code).digest('hex');
        if (inputHash !== verif.otp_hash) {
            return reply.redirect('/?error=invalid_verification_code');
        }
        // Mark as used
        (0, db_js_1.dbUpdate)('email_verifications', { used: 1 }, { id: verif.id });
        const payload = JSON.parse(verif.payload_json);
        const slug = payload.slug;
        // Archive any old deleted store
        const deletedStore = (0, db_js_1.dbFetchOne)('stores', { slug, status: 'deleted' });
        if (deletedStore) {
            (0, db_js_1.dbUpdate)('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
        }
        const now = new Date();
        const isPaidPlan = payload.plan_tier === 'pro' || payload.plan_tier === 'business';
        const storeId = (0, db_js_1.dbInsert)('stores', {
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
        const newStore = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
        req.session.merchantStore = newStore;
        // Bind Affiliate Referral if payload or cookie has referral code
        const magicRefCode = payload.ref_code || req.cookies?.zlik_aff;
        if (magicRefCode) {
            try {
                (0, affiliateService_js_1.bindReferredStore)(storeId, magicRefCode, req.cookies?.zlik_aff_session);
            }
            catch (err) { }
        }
        if (!isPaidPlan) {
            (0, mailer_js_1.sendMerchantWelcomeEmail)(newStore).catch(() => { });
            return reply.redirect('/merchant?verified=1');
        }
        else {
            return reply.redirect(`/merchant/settings?checkout=1&plan=${payload.plan_tier}&cycle=${payload.billing_cycle || 'monthly'}`);
        }
    });
    /**
     * 5. Direct / Automated Merchant Registration (Compatibility / Testing endpoint)
     */
    fastify.post('/api/auth/register', async (req, reply) => {
        const body = (req.body || {});
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
        const slugCheck = (0, helpers_js_1.validateStoreSlugAvailability)(rawSlug);
        if (!slugCheck.valid) {
            return reply.send({ success: false, error: slugCheck.error });
        }
        const slug = slugCheck.normalizedSlug;
        const deletedStore = (0, db_js_1.dbFetchOne)('stores', { slug, status: 'deleted' });
        if (deletedStore) {
            (0, db_js_1.dbUpdate)('stores', { slug: `${slug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
        }
        const passHash = await (0, helpers_js_1.hashPassword)(pin);
        const now = new Date();
        const storeId = (0, db_js_1.dbInsert)('stores', {
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
        const newStore = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
        req.session.merchantStore = newStore;
        // Bind Affiliate Referral if cookie or payload has referral code
        const directRefCode = (body.ref_code || req.cookies?.zlik_aff || '').trim();
        if (directRefCode) {
            try {
                (0, affiliateService_js_1.bindReferredStore)(storeId, directRefCode, req.cookies?.zlik_aff_session);
            }
            catch (err) { }
        }
        return reply.send({ success: true, store: newStore, redirect: '/merchant' });
    });
    /**
     * Helper: Multi-attribute robust store resolver
     * Resolves stores by case-insensitive email, normalized phone, store slug, or store name
     */
    function findStoreByIdentifier(rawInput) {
        if (!rawInput)
            return null;
        const input = rawInput.trim();
        if (!input)
            return null;
        const allStores = (0, db_js_1.dbFetchAll)('stores');
        // 1. If it contains @, match email case-insensitively and trimmed
        if (input.includes('@')) {
            const targetEmail = input.toLowerCase();
            const match = allStores.find(s => s.status !== 'deleted' && (s.email || '').trim().toLowerCase() === targetEmail);
            if (match)
                return match;
        }
        // 2. Try normalized phone match (Nigerian and international formats, matching last 10 digits)
        const phoneNorm = (0, helpers_js_1.normalizePhoneNumber)(input);
        if (phoneNorm) {
            const match = allStores.find(s => {
                if (s.status === 'deleted')
                    return false;
                const sNorm = (0, helpers_js_1.normalizePhoneNumber)(s.whatsapp_number);
                return sNorm === phoneNorm || (phoneNorm.length >= 7 && sNorm.endsWith(phoneNorm.slice(-10)));
            });
            if (match)
                return match;
        }
        // 3. Direct email check (in case user entered email without @ or with trailing spaces)
        const emailMatch = allStores.find(s => s.status !== 'deleted' && (s.email || '').trim().toLowerCase() === input.toLowerCase());
        if (emailMatch)
            return emailMatch;
        // 4. Try matching store slug or store name (in case seller entered their store handle)
        const cleanSlug = input.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        const slugMatch = allStores.find(s => s.status !== 'deleted' &&
            ((s.slug || '').toLowerCase() === cleanSlug || (s.store_name || '').toLowerCase().trim() === input.toLowerCase()));
        if (slugMatch)
            return slugMatch;
        return null;
    }
    /**
     * 6. Merchant Dual Login (Email OR WhatsApp Phone with 5-Digit PIN)
     */
    fastify.post('/api/auth/login', async (req, reply) => {
        const body = (req.body || {});
        const identifier = body.identifier?.trim() || body.email?.trim();
        const pin = (body.pin || body.password || '').trim();
        if (!identifier || !pin) {
            return reply.send({ success: false, error: 'Please enter your email or WhatsApp number and 5-digit PIN' });
        }
        const store = findStoreByIdentifier(identifier);
        if (!store) {
            return reply.send({ success: false, error: 'No store account found with this email, WhatsApp number, or store handle' });
        }
        const matches = await (0, helpers_js_1.comparePassword)(pin, store.password_hash);
        if (!matches) {
            return reply.send({ success: false, error: 'Incorrect 5-digit PIN' });
        }
        req.session.merchantStore = store;
        return reply.send({ success: true, store, redirect: '/merchant' });
    });
    /**
     * 7. Merchant Logout
     */
    fastify.get('/merchant/logout', async (req, reply) => {
        req.session.merchantStore = null;
        return reply.redirect('/merchant/login');
    });
    /**
     * 8. Super Admin Login (Compatibility Route)
     */
    fastify.post('/api/auth/admin_login', async (req, reply) => {
        const body = (req.body || {});
        const email = body.email?.toLowerCase().trim();
        const password = body.password;
        const admin = (0, db_js_1.dbFetchOne)('super_admins', { email });
        if (!admin) {
            return reply.send({ success: false, error: 'Invalid admin credentials' });
        }
        const matches = await (0, helpers_js_1.comparePassword)(password, admin.password_hash);
        if (!matches) {
            return reply.send({ success: false, error: 'Invalid admin credentials' });
        }
        req.session.admin_id = admin.id;
        req.session.admin_name = admin.name;
        req.session.admin_role = admin.role;
        req.session.superAdmin = admin;
        (0, db_js_1.dbUpdate)('super_admins', {
            last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            last_login_ip: req.ip
        }, { id: admin.id });
        return reply.send({ success: true, redirect: '/admin' });
    });
    /**
     * 9. Merchant Forgot PIN - Initiate Reset Code
     */
    fastify.post('/api/auth/forgot-pin', async (req, reply) => {
        const body = (req.body || {});
        const identifier = (body.identifier || body.email || body.phone || '').trim();
        if (!identifier) {
            return reply.send({ success: false, error: 'Please enter your registered email address, WhatsApp number, or store handle' });
        }
        const store = findStoreByIdentifier(identifier);
        if (!store) {
            return reply.send({
                success: false,
                error: 'No store account found matching that email, phone number, or store handle. Please verify and try again.'
            });
        }
        const email = (store.email || '').trim();
        if (!email || !email.includes('@')) {
            return reply.send({
                success: false,
                error: `Your store "${store.store_name}" does not have an email address linked on file. Please contact Zlik WhatsApp support for manual PIN recovery.`
            });
        }
        // Generate 6-digit secure numeric OTP
        const otpCode = String(node_crypto_1.default.randomInt(100000, 999999));
        const tokenHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        const nowMs = Date.now();
        const expiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString(); // 15 minutes validity
        // Invalidate any older unused resets for this store
        const existingResets = (0, db_js_1.dbFetchAll)('password_resets', { account_id: store.id, used: 0 });
        for (const r of existingResets) {
            (0, db_js_1.dbUpdate)('password_resets', { used: 1 }, { id: r.id });
        }
        // Insert new reset record
        (0, db_js_1.dbInsert)('password_resets', {
            account_type: 'store',
            account_id: store.id,
            email: store.email,
            token_hash: tokenHash,
            expires_at: expiresAt,
            used: 0,
            created_at: new Date(nowMs).toISOString()
        });
        // Send email
        await (0, mailer_js_1.sendPinResetEmail)(store.email, store.owner_name || store.store_name, otpCode);
        // Mask email for client preview: e.g. jo***@gmail.com
        const emailParts = email.split('@');
        const namePart = emailParts[0];
        const maskedName = namePart.length <= 2
            ? namePart[0] + '***'
            : namePart.slice(0, 2) + '*'.repeat(Math.max(2, namePart.length - 3)) + namePart.slice(-1);
        const maskedEmail = `${maskedName}@${emailParts[1]}`;
        return reply.send({
            success: true,
            store_found: true,
            masked_destination: maskedEmail,
            message: `A 6-digit PIN reset code was sent to ${maskedEmail}.`,
            expires_in: 900
        });
    });
    /**
     * 10. Merchant Reset PIN - Verify OTP & Update 5-Digit PIN
     */
    fastify.post('/api/auth/reset-pin', async (req, reply) => {
        const body = (req.body || {});
        const identifier = (body.identifier || body.email || body.phone || '').trim();
        const otpCode = String(body.otp_code || body.code || '').trim();
        const newPin = String(body.new_pin || body.pin || '').trim();
        if (!identifier) {
            return reply.send({ success: false, error: 'Store identifier (email or phone) is required' });
        }
        if (!otpCode || otpCode.length !== 6) {
            return reply.send({ success: false, error: 'Please enter the 6-digit verification code' });
        }
        if (!/^\d{5}$/.test(newPin)) {
            return reply.send({ success: false, error: 'New PIN must be exactly 5 digits (numbers only)' });
        }
        const store = findStoreByIdentifier(identifier);
        if (!store) {
            return reply.send({ success: false, error: 'Store account not found' });
        }
        // Find active reset request for this store
        const resets = (0, db_js_1.dbFetchAll)('password_resets', { account_id: store.id, used: 0 });
        const latestReset = resets.sort((a, b) => b.id - a.id)[0];
        if (!latestReset) {
            return reply.send({ success: false, error: 'No active PIN reset request found. Please request a new code.' });
        }
        const expiryMs = parseDateMs(latestReset.expires_at);
        if (Date.now() > expiryMs) {
            return reply.send({ success: false, error: 'Verification code has expired. Please request a new code.' });
        }
        const inputHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        if (inputHash !== latestReset.token_hash) {
            return reply.send({ success: false, error: 'Invalid verification code. Please check and try again.' });
        }
        // Mark reset token as used
        (0, db_js_1.dbUpdate)('password_resets', { used: 1 }, { id: latestReset.id });
        // Hash new 5-digit PIN and update store
        const newPassHash = await (0, helpers_js_1.hashPassword)(newPin);
        const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
        (0, db_js_1.dbUpdate)('stores', {
            password_hash: newPassHash,
            updated_at: nowIso
        }, { id: store.id });
        const updatedStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
        // Establish authenticated merchant session
        req.session.merchantStore = updatedStore;
        return reply.send({
            success: true,
            message: 'Your 5-digit PIN has been successfully reset. You are now logged in.',
            store: updatedStore,
            redirect: '/merchant'
        });
    });
}
