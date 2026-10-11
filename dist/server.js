"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastify = void 0;
exports.startServer = startServer;
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const static_1 = __importDefault(require("@fastify/static"));
const view_1 = __importDefault(require("@fastify/view"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const session_1 = __importDefault(require("@fastify/session"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const cors_1 = __importDefault(require("@fastify/cors"));
const ejs_1 = __importDefault(require("ejs"));
const node_path_1 = __importDefault(require("node:path"));
const db_js_1 = require("./db/db.js");
const helpers_js_1 = require("./utils/helpers.js");
const templates_js_1 = require("./config/templates.js");
const sampleTemplatesData_js_1 = require("./config/sampleTemplatesData.js");
const chatController_js_1 = require("./modules/chat/chatController.js");
const chatWs_js_1 = require("./modules/chat/chatWs.js");
const ordersController_js_1 = require("./modules/orders/ordersController.js");
const authController_js_1 = require("./modules/auth/authController.js");
const adminController_js_1 = require("./modules/admin/adminController.js");
const debtsController_js_1 = require("./modules/debts/debtsController.js");
const ledgerController_js_1 = require("./modules/ledger/ledgerController.js");
const marketingController_js_1 = require("./modules/marketing/marketingController.js");
const reviewsController_js_1 = require("./modules/reviews/reviewsController.js");
const bulkController_js_1 = require("./modules/bulk/bulkController.js");
const broadcastsController_js_1 = require("./modules/broadcasts/broadcastsController.js");
const teamsController_js_1 = require("./modules/teams/teamsController.js");
const branchesController_js_1 = require("./modules/branches/branchesController.js");
const domainsController_js_1 = require("./modules/domains/domainsController.js");
const multiStoreController_js_1 = require("./modules/stores/multiStoreController.js");
const analyticsController_js_1 = require("./modules/analytics/analyticsController.js");
const billingController_js_1 = require("./modules/billing/billingController.js");
const mailer_js_1 = require("./modules/email/mailer.js");
const multipart_1 = __importDefault(require("@fastify/multipart"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = require("node:stream/promises");
const env_js_1 = require("./config/env.js");
const adminSecurity_js_1 = require("./modules/admin/adminSecurity.js");
const bankChangeOtpStore = new Map();
const fastify = (0, fastify_1.default)({
    logger: false,
    bodyLimit: 25 * 1024 * 1024 // 25MB body limit
});
exports.fastify = fastify;
// Middleware & Plugins
fastify.register(cors_1.default, { origin: true, credentials: true });
fastify.register(multipart_1.default, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 10 // Up to 10 images simultaneously
    }
});
fastify.register(formbody_1.default);
fastify.register(cookie_1.default);
fastify.register(session_1.default, {
    secret: env_js_1.ENV.SESSION_SECRET,
    cookie: {
        secure: process.env.COOKIE_SECURE === 'true',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400000 * 14 // 14 days
    }
});
// Initialize Super Admin Credentials & Security Baseline
(0, adminSecurity_js_1.initSuperAdminAccount)();
fastify.register(websocket_1.default);
// Static Assets & Views Path Resolution (supports both tsx dev and compiled dist)
const publicDir = node_fs_1.default.existsSync(node_path_1.default.join(__dirname, 'public'))
    ? node_path_1.default.join(__dirname, 'public')
    : node_path_1.default.resolve(process.cwd(), 'src', 'public');
const viewsDir = node_fs_1.default.existsSync(node_path_1.default.join(__dirname, 'views'))
    ? node_path_1.default.join(__dirname, 'views')
    : node_path_1.default.resolve(process.cwd(), 'src', 'views');
fastify.register(static_1.default, {
    root: publicDir,
    prefix: '/'
});
// View Engine (EJS)
fastify.register(view_1.default, {
    engine: { ejs: ejs_1.default },
    root: viewsDir
});
// Register API Routes
fastify.register(chatController_js_1.chatRoutes);
fastify.register(chatWs_js_1.chatWebSocketRoutes);
fastify.register(ordersController_js_1.ordersRoutes);
fastify.register(authController_js_1.authRoutes);
fastify.register(adminController_js_1.adminRoutes);
fastify.register(debtsController_js_1.debtsRoutes);
fastify.register(ledgerController_js_1.ledgerRoutes);
fastify.register(marketingController_js_1.marketingRoutes);
fastify.register(reviewsController_js_1.reviewsRoutes);
fastify.register(bulkController_js_1.bulkRoutes);
fastify.register(broadcastsController_js_1.broadcastsRoutes);
fastify.register(teamsController_js_1.teamsRoutes);
fastify.register(branchesController_js_1.branchesRoutes);
fastify.register(domainsController_js_1.domainsRoutes);
fastify.register(multiStoreController_js_1.multiStoreRoutes);
fastify.register(analyticsController_js_1.analyticsRoutes);
fastify.register(billingController_js_1.billingRoutes);
// Direct High-Speed Image Upload API (Up to 10MB per image, single or multiple)
fastify.post('/api/upload', async (req, reply) => {
    const store = req.session?.merchantStore;
    const adminId = req.session?.admin_id;
    if (!store && !adminId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized: Login required to upload files' });
    }
    const uploadDir = node_path_1.default.join(publicDir, 'uploads');
    if (!node_fs_1.default.existsSync(uploadDir)) {
        node_fs_1.default.mkdirSync(uploadDir, { recursive: true });
    }
    const uploadedFiles = [];
    try {
        const parts = req.files();
        for await (const part of parts) {
            const ext = node_path_1.default.extname(part.filename || '').toLowerCase() || '.png';
            const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
            if (!allowedExts.includes(ext)) {
                return reply.code(400).send({ success: false, error: `Invalid image type '${ext}'. Supported: JPG, PNG, WEBP, GIF, SVG, AVIF.` });
            }
            const randomName = `img_${Date.now()}_${node_crypto_1.default.randomBytes(6).toString('hex')}${ext}`;
            const targetPath = node_path_1.default.join(uploadDir, randomName);
            await (0, promises_1.pipeline)(part.file, node_fs_1.default.createWriteStream(targetPath));
            uploadedFiles.push(`/uploads/${randomName}`);
        }
    }
    catch (err) {
        if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
            return reply.code(413).send({ success: false, error: 'Image exceeds maximum allowed size of 10MB.' });
        }
        return reply.code(500).send({ success: false, error: 'Failed to process file upload: ' + (err.message || 'Unknown error') });
    }
    if (uploadedFiles.length === 0) {
        return reply.code(400).send({ success: false, error: 'No image files uploaded.' });
    }
    return reply.send({
        success: true,
        url: uploadedFiles[0],
        urls: uploadedFiles
    });
});
// Merchant Items & Settings API
fastify.post('/api/merchant/items', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const body = (req.body || {});
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const itemPayload = {
        store_id: store.id,
        title: body.title?.trim() || 'Untitled Product',
        category: body.category?.trim() || 'General',
        description: body.description !== undefined ? body.description : null,
        price: Math.max(0, parseFloat(body.price || 0)),
        compare_price: body.compare_price !== undefined && body.compare_price !== '' && !isNaN(parseFloat(body.compare_price)) ? parseFloat(body.compare_price) : null,
        stock_quantity: body.stock_quantity !== undefined && body.stock_quantity !== '' && !isNaN(parseInt(body.stock_quantity)) ? parseInt(body.stock_quantity) : 0,
        low_stock_threshold: body.low_stock_threshold !== undefined && body.low_stock_threshold !== '' && !isNaN(parseInt(body.low_stock_threshold)) ? parseInt(body.low_stock_threshold) : 5,
        sku: body.sku ? body.sku.trim() : null,
        badge: body.badge ? body.badge.trim() : null,
        image_url: body.image_url ? body.image_url.trim() : null,
        gallery_json: typeof body.gallery_json === 'object' ? JSON.stringify(body.gallery_json) : (body.gallery_json || null),
        variants_json: typeof body.variants_json === 'object' ? JSON.stringify(body.variants_json) : (body.variants_json || null),
        option_groups_json: typeof body.option_groups_json === 'object' ? JSON.stringify(body.option_groups_json) : (body.option_groups_json || null),
        specs_json: typeof body.specs_json === 'object' ? JSON.stringify(body.specs_json) : (body.specs_json || null),
        attributes_json: typeof body.attributes_json === 'object' ? JSON.stringify(body.attributes_json) : (body.attributes_json || null),
        is_preorder: body.is_preorder ? 1 : 0,
        preorder_dispatch_date: body.preorder_dispatch_date ? body.preorder_dispatch_date.trim() : null,
        branch_id: body.branch_id ? parseInt(body.branch_id) : null,
        video_url: body.video_url ? body.video_url.trim() : null,
        is_available: body.is_available === 0 || body.is_available === false || body.is_available === '0' ? 0 : 1,
        updated_at: now
    };
    let item;
    if (body.id) {
        const existing = (0, db_js_1.dbFetchOne)('items', { id: parseInt(body.id), store_id: store.id });
        if (!existing)
            return reply.code(404).send({ success: false, error: 'Product not found' });
        (0, db_js_1.dbUpdate)('items', itemPayload, { id: existing.id });
        item = (0, db_js_1.dbFetchOne)('items', { id: existing.id });
    }
    else {
        itemPayload.created_at = now;
        const itemId = (0, db_js_1.dbInsert)('items', itemPayload);
        item = (0, db_js_1.dbFetchOne)('items', { id: itemId });
    }
    return reply.send({ success: true, item });
});
fastify.delete('/api/merchant/items', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const id = parseInt(req.query?.id || '0');
    (0, db_js_1.dbDelete)('items', { id, store_id: store.id });
    return reply.send({ success: true });
});
// Merchant Payout Bank Change OTP Request
fastify.post('/api/merchant/bank/request-otp', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const body = (req.body || {});
    const newAccountNumber = (body.bank_account_number || '').trim();
    const newBankName = (body.bank_name || '').trim();
    const newAccountName = (body.bank_account_name || '').trim();
    if (!newAccountNumber) {
        return reply.code(400).send({ success: false, error: 'New account number is required.' });
    }
    // Get recipient email (store.email or owner email)
    let ownerEmail = store.email;
    if (!ownerEmail || !ownerEmail.includes('@')) {
        const freshStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
        if (freshStore && freshStore.email) {
            ownerEmail = freshStore.email;
        }
    }
    if (!ownerEmail || !ownerEmail.includes('@')) {
        return reply.code(400).send({ success: false, error: 'No valid email address linked to your store account to receive verification OTP.' });
    }
    const otpCode = String(node_crypto_1.default.randomInt(100000, 999999));
    const otpHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    bankChangeOtpStore.set(store.id, {
        otp_hash: otpHash,
        expires_at: expiresAt,
        account_number: newAccountNumber,
        bank_name: newBankName,
        account_name: newAccountName
    });
    // Dispatch Security OTP Email
    await (0, mailer_js_1.sendBankAccountChangeOtp)(ownerEmail, store.store_name || 'Store Owner', otpCode, newBankName, newAccountNumber);
    const parts = ownerEmail.split('@');
    const maskedUser = parts[0].length > 2 ? parts[0].slice(0, 2) + '••••' + parts[0].slice(-1) : '••';
    const maskedEmail = `${maskedUser}@${parts[1]}`;
    return reply.send({
        success: true,
        message: `Security authorization code sent to ${maskedEmail}.`,
        masked_email: maskedEmail,
        expires_in: 300
    });
});
fastify.post('/api/merchant/settings', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const body = (req.body || {});
    const updates = {};
    if (body.slug && body.slug !== store.slug) {
        const slugCheck = (0, helpers_js_1.validateStoreSlugAvailability)(body.slug, store.id);
        if (!slugCheck.valid) {
            return reply.send({ success: false, error: slugCheck.error });
        }
        const newSlug = slugCheck.normalizedSlug;
        // Archive any old deleted store that had this slug
        const deletedStore = (0, db_js_1.dbFetchOne)('stores', { slug: newSlug, status: 'deleted' });
        if (deletedStore) {
            (0, db_js_1.dbUpdate)('stores', { slug: `${newSlug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
        }
        updates.slug = newSlug;
    }
    if (body.template_slug !== undefined) {
        const validTemplates = Object.keys(templates_js_1.STORE_TEMPLATES);
        if (validTemplates.includes(body.template_slug)) {
            updates.template_slug = body.template_slug;
        }
    }
    if (body.store_name)
        updates.store_name = body.store_name.trim();
    if (body.bio !== undefined)
        updates.bio = body.bio.trim();
    if (body.logo_url !== undefined)
        updates.logo_url = body.logo_url;
    if (body.cover_url !== undefined)
        updates.cover_url = body.cover_url;
    if (body.cover_overlay_color !== undefined)
        updates.cover_overlay_color = body.cover_overlay_color;
    if (body.receipt_custom_note !== undefined)
        updates.receipt_custom_note = body.receipt_custom_note ? body.receipt_custom_note.trim() : null;
    if (body.receipt_show_logo !== undefined)
        updates.receipt_show_logo = body.receipt_show_logo ? 1 : 0;
    if (body.meta_pixel_id !== undefined)
        updates.meta_pixel_id = body.meta_pixel_id ? body.meta_pixel_id.trim() : null;
    if (body.google_tag_id !== undefined)
        updates.google_tag_id = body.google_tag_id ? body.google_tag_id.trim() : null;
    if (body.tiktok_pixel_id !== undefined)
        updates.tiktok_pixel_id = body.tiktok_pixel_id ? body.tiktok_pixel_id.trim() : null;
    if (body.alert_sound !== undefined)
        updates.alert_sound = body.alert_sound;
    if (body.delivery_fee !== undefined)
        updates.delivery_fee = parseFloat(body.delivery_fee || 0);
    // Check if bank account number is being modified
    const currentBankAcct = (store.bank_account_number || '').trim();
    const rawNewBankAcct = body.bank_account_number !== undefined ? String(body.bank_account_number).trim() : currentBankAcct;
    const isChangingBankAcct = rawNewBankAcct !== '' && rawNewBankAcct !== currentBankAcct;
    if (isChangingBankAcct) {
        const otpCode = (body.otp_code || '').trim();
        if (!otpCode) {
            return reply.send({
                success: false,
                require_otp: true,
                error: 'Security authorization code is required to change your payout bank account number.'
            });
        }
        const record = bankChangeOtpStore.get(store.id);
        if (!record || Date.now() > record.expires_at) {
            return reply.send({
                success: false,
                require_otp: true,
                error: 'Verification code has expired or was not requested. Please request a new code.'
            });
        }
        const inputHash = node_crypto_1.default.createHash('sha256').update(otpCode).digest('hex');
        if (inputHash !== record.otp_hash) {
            return reply.send({
                success: false,
                require_otp: true,
                error: 'Invalid 6-digit verification code. Please check your email and try again.'
            });
        }
        // OTP Verified! Commit bank details and delete OTP
        bankChangeOtpStore.delete(store.id);
        updates.bank_account_number = rawNewBankAcct;
        if (body.bank_name !== undefined)
            updates.bank_name = body.bank_name ? body.bank_name.trim() : null;
        if (body.bank_account_name !== undefined)
            updates.bank_account_name = body.bank_account_name ? body.bank_account_name.trim() : null;
    }
    else {
        // If account number did not change, allow updating bank name and account name if provided
        if (body.bank_name !== undefined)
            updates.bank_name = body.bank_name ? body.bank_name.trim() : null;
        if (body.bank_account_name !== undefined)
            updates.bank_account_name = body.bank_account_name ? body.bank_account_name.trim() : null;
        if (body.bank_account_number !== undefined && !isChangingBankAcct)
            updates.bank_account_number = body.bank_account_number ? body.bank_account_number.trim() : null;
    }
    (0, db_js_1.dbUpdate)('stores', updates, { id: store.id });
    req.session.merchantStore = { ...store, ...updates };
    return reply.send({ success: true, store: req.session.merchantStore });
});
// Inbound Enterprise Inquiry API
fastify.post('/api/enterprise-inquiry', async (req, reply) => {
    const body = req.body || {};
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const phone = (body.phone || '').trim();
    const business_name = (body.business_name || '').trim();
    const store_volume = (body.store_volume || '').trim();
    const notes = (body.notes || '').trim();
    if (!name || !email) {
        return reply.code(400).send({ success: false, error: 'Full name and email are required.' });
    }
    if (!email.includes('@')) {
        return reply.code(400).send({ success: false, error: 'Please enter a valid email address.' });
    }
    try {
        const leadId = (0, db_js_1.dbInsert)('enterprise_leads', {
            name,
            email,
            phone: phone || null,
            business_name: business_name || null,
            store_volume: store_volume || null,
            notes: notes || null,
            status: 'new'
        });
        // Notify Super Admin via email (non-blocking)
        const superAdminEmail = env_js_1.ENV.SUPER_ADMIN_EMAIL || 'admin@zlik.store';
        try {
            const adminDashboardUrl = `${env_js_1.ENV.APP_URL}/${env_js_1.ENV.ADMIN_SECRET_PATH}`;
            await (0, mailer_js_1.sendEmail)({
                toEmail: superAdminEmail,
                toName: 'Zlik Super Admin',
                subject: `🏢 New Enterprise Inquiry: ${business_name || name}`,
                htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E3E9E5; border-radius: 16px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
              <span style="background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 999px; text-transform: uppercase;">Enterprise Lead</span>
              <h2 style="color: #08110D; margin: 8px 0 4px 0; font-size: 20px;">New Enterprise Inquiry Received</h2>
              <p style="color: #6B756F; font-size: 13px; margin: 0;">An enterprise customer submitted an inquiry from the landing page.</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; width: 140px; font-weight: 600;">Contact Name</td>
                <td style="padding: 10px 0; color: #08110D; font-weight: 600;">${name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Work Email</td>
                <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #087A50; font-weight: 600; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Phone / WhatsApp</td>
                <td style="padding: 10px 0; color: #08110D;">${phone ? `<a href="tel:${phone}" style="color: #08110D; text-decoration: none;">${phone}</a> &bull; <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" target="_blank" style="color: #25D366; font-weight: 600; text-decoration: none;">WhatsApp Chat</a>` : 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Business Name</td>
                <td style="padding: 10px 0; color: #08110D; font-weight: 600;">${business_name || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600;">Est. Sales Volume</td>
                <td style="padding: 10px 0; color: #08110D;">${store_volume || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B756F; font-weight: 600; vertical-align: top;">Requirements</td>
                <td style="padding: 10px 0; color: #08110D; white-space: pre-wrap;">${notes || 'None provided'}</td>
              </tr>
            </table>

            <div style="text-align: center; padding-top: 10px;">
              <a href="${adminDashboardUrl}" style="background: #19D98B; color: #08110D; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 13px; display: inline-block;">Open Super Admin Dashboard &rarr;</a>
            </div>
          </div>
        `,
                templateName: 'enterprise_inquiry'
            });
        }
        catch (e) {
            fastify.log.warn('Could not dispatch enterprise alert email: ' + (e?.message || e));
        }
        return reply.send({ success: true, message: 'Inquiry received successfully.', leadId });
    }
    catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ success: false, error: 'Failed to record inquiry: ' + (err.message || 'Unknown database error') });
    }
});
// SSR Page Routes
// 1. Landing Page
fastify.get('/', async (req, reply) => {
    const settings = (0, helpers_js_1.getPlatformSettings)();
    const plans = (0, helpers_js_1.getEffectivePlans)();
    return reply.view('landing.ejs', { settings, plans });
});
// 1b. Terms of Service
fastify.get('/terms', async (req, reply) => {
    return reply.view('terms.ejs');
});
// 1c. Privacy Policy (NDPA & NDPR Compliant)
fastify.get('/privacy', async (req, reply) => {
    return reply.view('privacy.ejs');
});
// 2. Marketplace Directory
fastify.get('/marketplace', async (req, reply) => {
    const rawStores = (0, db_js_1.dbFetchAll)('stores', { status: 'active' });
    const stores = rawStores.map(s => ({
        ...s,
        category_info: (0, helpers_js_1.getStoreCategoryInfo)(s)
    }));
    return reply.view('marketplace.ejs', { stores, categories: helpers_js_1.STORE_MARKETPLACE_CATEGORIES, states: helpers_js_1.NIGERIAN_STATES });
});
// 3. Merchant Login View & Aliases
fastify.get('/login', async (req, reply) => {
    return reply.redirect('/merchant/login');
});
fastify.get('/register', async (req, reply) => {
    return reply.redirect('/?signup=1');
});
fastify.get('/merchant/login', async (req, reply) => {
    if (req.session?.merchantStore) {
        return reply.redirect('/merchant');
    }
    return reply.view('merchant/login.ejs');
});
// 4. Merchant Dashboard View
fastify.get('/merchant', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    const orders = (0, db_js_1.dbFetchAll)('orders', { store_id: currentStore.id }, 'id DESC');
    const items = (0, db_js_1.dbFetchAll)('items', { store_id: currentStore.id, is_available: 1 });
    const lowStockItems = items.filter(i => i.stock_quantity > -1 && i.stock_quantity <= (i.low_stock_threshold || 5));
    const revenueMetrics = (0, helpers_js_1.calculateStoreRevenueMetrics)(orders);
    const visitorMetrics = (0, analyticsController_js_1.getStoreVisitorMetrics)(currentStore.id);
    const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(currentStore.template_slug);
    return reply.view('merchant/dashboard.ejs', {
        store: currentStore,
        orders,
        revenueMetrics,
        visitorMetrics,
        lowStockItems,
        isPro,
        planConfig: config,
        templateConfig,
        allTemplates: templates_js_1.STORE_TEMPLATES
    });
});
// 5. Merchant Live Chat Messages View
fastify.get('/merchant/messages', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    return reply.view('merchant/messages.ejs', { store: currentStore });
});
// 6. Merchant Items View
fastify.get('/merchant/items', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    const items = (0, db_js_1.dbFetchAll)('items', { store_id: currentStore.id }, 'id DESC');
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(currentStore.template_slug);
    const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
    return reply.view('merchant/items.ejs', {
        store: currentStore,
        items,
        templateConfig,
        allTemplates: templates_js_1.STORE_TEMPLATES,
        isPro,
        planConfig: config
    });
});
// 7. Merchant Sales Ledger View
fastify.get('/merchant/ledger', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
    const db = (0, db_js_1.getDb)();
    let orders = [];
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    if (!isPro) {
        // Free plan: includes today, yesterday, this week, this month, and last month
        const stmt = db.prepare(`
      SELECT * FROM orders 
      WHERE store_id = ? AND created_at >= ? 
      ORDER BY id DESC
    `);
        orders = stmt.all(currentStore.id, lastMonthStart);
    }
    else {
        orders = (0, db_js_1.dbFetchAll)('orders', { store_id: currentStore.id }, 'id DESC');
    }
    const paidOrders = orders.filter(o => o.payment_status === 'paid');
    const totalSalesRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const averageOrderValue = paidOrders.length > 0 ? (totalSalesRevenue / paidOrders.length) : 0;
    const pendingOrdersCount = orders.filter(o => o.payment_status !== 'paid').length;
    const summary = {
        total_orders: orders.length,
        paid_orders_count: paidOrders.length,
        pending_orders_count: pendingOrdersCount,
        total_revenue: totalSalesRevenue,
        average_order_value: averageOrderValue,
        is_restricted: !isPro,
        allowed_free_timeframes: ['today', 'yesterday', 'this_week', 'this_month', 'last_month']
    };
    return reply.view('merchant/ledger.ejs', {
        store: currentStore,
        orders,
        summary,
        isPro,
        planConfig: config
    });
});
// 8. Merchant Debt Tracker View
fastify.get('/merchant/debts', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
    const debts = (0, db_js_1.dbFetchAll)('debts', { store_id: currentStore.id }, 'id DESC');
    const activeDebts = debts.filter(d => d.status === 'pending');
    const paidDebts = debts.filter(d => d.status === 'paid');
    const totalOutstanding = activeDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalRecovered = paidDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const stats = {
        total_outstanding: totalOutstanding,
        total_recovered: totalRecovered,
        active_count: activeDebts.length,
        paid_count: paidDebts.length,
        max_active_limit: config.limits.active_debts_limit
    };
    return reply.view('merchant/debts.ejs', {
        store: currentStore,
        debts,
        stats,
        isPro,
        planConfig: config
    });
});
// 9. Merchant Settings View
fastify.get('/merchant/settings', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
    const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(currentStore.template_slug);
    return reply.view('merchant/settings.ejs', {
        store: currentStore,
        templateConfig,
        allTemplates: templates_js_1.STORE_TEMPLATES,
        storeCategories: templates_js_1.STORE_CATEGORIES,
        isPro,
        planConfig: config
    });
});
// 8. Order Tracking View
fastify.get('/order/:ref', async (req, reply) => {
    const ref = req.params.ref;
    const order = (0, db_js_1.dbFetchOne)('orders', { order_ref: ref });
    if (!order)
        return reply.code(404).send('Order not found');
    const store = (0, db_js_1.dbFetchOne)('stores', { id: order.store_id });
    let items = [];
    try {
        items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
    }
    catch (e) { }
    return reply.view('order_track.ejs', { order, store, items });
});
// 9. Order Receipt View
fastify.get('/receipt/:ref', async (req, reply) => {
    const ref = req.params.ref;
    const order = (0, db_js_1.dbFetchOne)('orders', { order_ref: ref });
    if (!order)
        return reply.code(404).send('Receipt not found');
    const store = (0, db_js_1.dbFetchOne)('stores', { id: order.store_id });
    let items = [];
    try {
        items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
    }
    catch (e) { }
    return reply.view('receipt.ejs', { order, store, items });
});
// Helper to check if store has active, valid promo codes with timeframe/discount
const checkHasActiveCoupons = (storeId) => {
    try {
        const coupons = (0, db_js_1.dbFetchAll)('coupons', { store_id: storeId, status: 'active' });
        const now = new Date();
        return coupons.some(c => {
            const discountVal = parseFloat(c.discount_value || 0);
            if (isNaN(discountVal) || discountVal <= 0)
                return false;
            if (c.expires_at) {
                const exp = new Date(c.expires_at);
                if (isNaN(exp.getTime()) || exp < now)
                    return false;
            }
            if (c.max_uses > 0 && c.uses_count >= c.max_uses)
                return false;
            return true;
        });
    }
    catch (e) {
        return false;
    }
};
// 10. Checkout Page View (/store/:slug/checkout or /:slug/checkout)
const renderCheckout = async (req, reply) => {
    const slug = req.params.slug;
    const store = (0, db_js_1.dbFetchOne)('stores', { slug });
    if (!store || store.status === 'deleted')
        return reply.code(404).send('Store not found');
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(store.template_slug);
    const hasActiveCoupons = checkHasActiveCoupons(store.id);
    return reply.view('checkout.ejs', { store, templateConfig, hasActiveCoupons });
};
fastify.get('/store/:slug/checkout', renderCheckout);
fastify.get('/:slug/checkout', renderCheckout);
// 11. Template Live Demo / Sample Preview View (/demo/:slug or /preview/:slug)
const renderTemplateDemo = async (req, reply) => {
    const templateSlug = req.params.slug;
    const sampleData = (0, sampleTemplatesData_js_1.getSampleDataForTemplate)(templateSlug);
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(templateSlug);
    const categories = Array.from(new Set(sampleData.items.map(i => i.category || 'General')));
    return reply.view('store.ejs', {
        store: sampleData.store,
        items: sampleData.items,
        categories,
        templateConfig,
        allTemplates: templates_js_1.STORE_TEMPLATES,
        isDemo: true,
        hasActiveCoupons: false
    });
};
fastify.get('/demo/:slug', renderTemplateDemo);
fastify.get('/preview/:slug', renderTemplateDemo);
// 12. Public Storefront View (/store/:slug or /:slug)
const renderStorefront = async (req, reply) => {
    const slug = req.params.slug;
    const store = (0, db_js_1.dbFetchOne)('stores', { slug });
    if (!store || store.status === 'deleted')
        return reply.code(404).send('Store not found');
    try {
        (0, analyticsController_js_1.recordStoreVisit)(store.id, req.ip, req.headers['user-agent']);
    }
    catch (e) { }
    const items = (0, db_js_1.dbFetchAll)('items', { store_id: store.id, is_available: 1 }, 'id DESC');
    const categories = Array.from(new Set(items.map(i => i.category || 'General')));
    const planDetails = (0, helpers_js_1.getStorePlanDetails)(store);
    const templateConfig = (0, templates_js_1.getStoreTemplateConfig)(store.template_slug);
    const hasActiveCoupons = checkHasActiveCoupons(store.id);
    return reply.view('store.ejs', {
        store,
        items,
        categories,
        templateConfig,
        allTemplates: templates_js_1.STORE_TEMPLATES,
        isDemo: false,
        isPro: planDetails.isPro,
        showPoweredBy: Boolean(planDetails.config.features.powered_by_zlik),
        hasActiveCoupons
    });
};
fastify.get('/store/:slug', renderStorefront);
fastify.get('/:slug', renderStorefront);
// Start High-Speed Server
async function startServer() {
    const PORT = env_js_1.ENV.PORT;
    const HOST = env_js_1.ENV.HOST;
    try {
        await fastify.listen({ port: PORT, host: HOST });
        console.log(`⚡ Zlik High-Speed Server running in [${env_js_1.ENV.NODE_ENV}] mode on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    }
    catch (err) {
        console.error('⚡ Server listen error:', err);
        process.exit(1);
    }
}
startServer().catch((err) => {
    console.error('⚡ Fatal server startup error:', err);
    process.exit(1);
});
exports.default = fastify;
