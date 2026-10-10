import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyFormbody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete } from './db/db.js';
import { getStorePlanDetails, calculateStoreRevenueMetrics, validateStoreSlugAvailability, getStoreCategoryInfo, STORE_MARKETPLACE_CATEGORIES, NIGERIAN_STATES, getEffectivePlans, getPlatformSettings } from './utils/helpers.js';
import { STORE_TEMPLATES, STORE_CATEGORIES, getStoreTemplateConfig } from './config/templates.js';
import { getSampleDataForTemplate } from './config/sampleTemplatesData.js';
import { chatRoutes } from './modules/chat/chatController.js';
import { chatWebSocketRoutes } from './modules/chat/chatWs.js';
import { ordersRoutes } from './modules/orders/ordersController.js';
import { authRoutes } from './modules/auth/authController.js';
import { adminRoutes } from './modules/admin/adminController.js';
import { debtsRoutes } from './modules/debts/debtsController.js';
import { ledgerRoutes } from './modules/ledger/ledgerController.js';
import { marketingRoutes } from './modules/marketing/marketingController.js';
import { reviewsRoutes } from './modules/reviews/reviewsController.js';
import { bulkRoutes } from './modules/bulk/bulkController.js';
import { broadcastsRoutes } from './modules/broadcasts/broadcastsController.js';
import { teamsRoutes } from './modules/teams/teamsController.js';
import { branchesRoutes } from './modules/branches/branchesController.js';
import { domainsRoutes } from './modules/domains/domainsController.js';
import { multiStoreRoutes } from './modules/stores/multiStoreController.js';
import { analyticsRoutes, recordStoreVisit, getStoreVisitorMetrics } from './modules/analytics/analyticsController.js';
import { billingRoutes } from './modules/billing/billingController.js';
import fastifyMultipart from '@fastify/multipart';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { ENV } from './config/env.js';
import { initSuperAdminAccount } from './modules/admin/adminSecurity.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fastify = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024 // 25MB body limit
});
// Middleware & Plugins
await fastify.register(fastifyCors, { origin: true, credentials: true });
await fastify.register(fastifyMultipart, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 10 // Up to 10 images simultaneously
    }
});
await fastify.register(fastifyFormbody);
await fastify.register(fastifyCookie);
await fastify.register(fastifySession, {
    secret: ENV.SESSION_SECRET,
    cookie: {
        secure: process.env.COOKIE_SECURE === 'true',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400000 * 14 // 14 days
    }
});
// Initialize Super Admin Credentials & Security Baseline
initSuperAdminAccount();
await fastify.register(fastifyWebsocket);
// Static Assets & Views Path Resolution (supports both tsx dev and compiled dist)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.resolve(process.cwd(), 'src', 'public');
const viewsDir = fs.existsSync(path.join(__dirname, 'views'))
    ? path.join(__dirname, 'views')
    : path.resolve(process.cwd(), 'src', 'views');
await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/'
});
// View Engine (EJS)
await fastify.register(fastifyView, {
    engine: { ejs },
    root: viewsDir
});
// Register API Routes
await fastify.register(chatRoutes);
await fastify.register(chatWebSocketRoutes);
await fastify.register(ordersRoutes);
await fastify.register(authRoutes);
await fastify.register(adminRoutes);
await fastify.register(debtsRoutes);
await fastify.register(ledgerRoutes);
await fastify.register(marketingRoutes);
await fastify.register(reviewsRoutes);
await fastify.register(bulkRoutes);
await fastify.register(broadcastsRoutes);
await fastify.register(teamsRoutes);
await fastify.register(branchesRoutes);
await fastify.register(domainsRoutes);
await fastify.register(multiStoreRoutes);
await fastify.register(analyticsRoutes);
await fastify.register(billingRoutes);
// Direct High-Speed Image Upload API (Up to 10MB per image, single or multiple)
fastify.post('/api/upload', async (req, reply) => {
    const store = req.session?.merchantStore;
    const adminId = req.session?.admin_id;
    if (!store && !adminId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized: Login required to upload files' });
    }
    const uploadDir = path.join(publicDir, 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const uploadedFiles = [];
    try {
        const parts = req.files();
        for await (const part of parts) {
            const ext = path.extname(part.filename || '').toLowerCase() || '.png';
            const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
            if (!allowedExts.includes(ext)) {
                return reply.code(400).send({ success: false, error: `Invalid image type '${ext}'. Supported: JPG, PNG, WEBP, GIF, SVG, AVIF.` });
            }
            const randomName = `img_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
            const targetPath = path.join(uploadDir, randomName);
            await pipeline(part.file, fs.createWriteStream(targetPath));
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
        const existing = dbFetchOne('items', { id: parseInt(body.id), store_id: store.id });
        if (!existing)
            return reply.code(404).send({ success: false, error: 'Product not found' });
        dbUpdate('items', itemPayload, { id: existing.id });
        item = dbFetchOne('items', { id: existing.id });
    }
    else {
        itemPayload.created_at = now;
        const itemId = dbInsert('items', itemPayload);
        item = dbFetchOne('items', { id: itemId });
    }
    return reply.send({ success: true, item });
});
fastify.delete('/api/merchant/items', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const id = parseInt(req.query?.id || '0');
    dbDelete('items', { id, store_id: store.id });
    return reply.send({ success: true });
});
fastify.post('/api/merchant/settings', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const body = (req.body || {});
    const updates = {};
    if (body.slug && body.slug !== store.slug) {
        const slugCheck = validateStoreSlugAvailability(body.slug, store.id);
        if (!slugCheck.valid) {
            return reply.send({ success: false, error: slugCheck.error });
        }
        const newSlug = slugCheck.normalizedSlug;
        // Archive any old deleted store that had this slug
        const deletedStore = dbFetchOne('stores', { slug: newSlug, status: 'deleted' });
        if (deletedStore) {
            dbUpdate('stores', { slug: `${newSlug}_archived_${deletedStore.id}` }, { id: deletedStore.id });
        }
        updates.slug = newSlug;
    }
    if (body.template_slug !== undefined) {
        const validTemplates = Object.keys(STORE_TEMPLATES);
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
    if (body.bank_name !== undefined)
        updates.bank_name = body.bank_name;
    if (body.bank_account_number !== undefined)
        updates.bank_account_number = body.bank_account_number;
    if (body.bank_account_name !== undefined)
        updates.bank_account_name = body.bank_account_name;
    if (body.alert_sound !== undefined)
        updates.alert_sound = body.alert_sound;
    if (body.delivery_fee !== undefined)
        updates.delivery_fee = parseFloat(body.delivery_fee || 0);
    dbUpdate('stores', updates, { id: store.id });
    req.session.merchantStore = { ...store, ...updates };
    return reply.send({ success: true, store: req.session.merchantStore });
});
// SSR Page Routes
// 1. Landing Page
fastify.get('/', async (req, reply) => {
    const settings = getPlatformSettings();
    const plans = getEffectivePlans();
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
    const rawStores = dbFetchAll('stores', { status: 'active' });
    const stores = rawStores.map(s => ({
        ...s,
        category_info: getStoreCategoryInfo(s)
    }));
    return reply.view('marketplace.ejs', { stores, categories: STORE_MARKETPLACE_CATEGORIES, states: NIGERIAN_STATES });
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
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    const orders = dbFetchAll('orders', { store_id: currentStore.id }, 'id DESC');
    const items = dbFetchAll('items', { store_id: currentStore.id, is_available: 1 });
    const lowStockItems = items.filter(i => i.stock_quantity > -1 && i.stock_quantity <= (i.low_stock_threshold || 5));
    const revenueMetrics = calculateStoreRevenueMetrics(orders);
    const visitorMetrics = getStoreVisitorMetrics(currentStore.id);
    const { isPro, config } = getStorePlanDetails(currentStore);
    const templateConfig = getStoreTemplateConfig(currentStore.template_slug);
    return reply.view('merchant/dashboard.ejs', {
        store: currentStore,
        orders,
        revenueMetrics,
        visitorMetrics,
        lowStockItems,
        isPro,
        planConfig: config,
        templateConfig,
        allTemplates: STORE_TEMPLATES
    });
});
// 5. Merchant Live Chat Messages View
fastify.get('/merchant/messages', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    return reply.view('merchant/messages.ejs', { store: currentStore });
});
// 6. Merchant Items View
fastify.get('/merchant/items', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    const items = dbFetchAll('items', { store_id: currentStore.id }, 'id DESC');
    const templateConfig = getStoreTemplateConfig(currentStore.template_slug);
    const { isPro, config } = getStorePlanDetails(currentStore);
    return reply.view('merchant/items.ejs', {
        store: currentStore,
        items,
        templateConfig,
        allTemplates: STORE_TEMPLATES,
        isPro,
        planConfig: config
    });
});
// 7. Merchant Sales Ledger View
fastify.get('/merchant/ledger', async (req, reply) => {
    const store = req.session?.merchantStore;
    if (!store)
        return reply.redirect('/merchant/login');
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    const { isPro, config } = getStorePlanDetails(currentStore);
    const db = getDb();
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
        orders = dbFetchAll('orders', { store_id: currentStore.id }, 'id DESC');
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
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    const { isPro, config } = getStorePlanDetails(currentStore);
    const debts = dbFetchAll('debts', { store_id: currentStore.id }, 'id DESC');
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
    const currentStore = dbFetchOne('stores', { id: store.id }) || store;
    const { isPro, config } = getStorePlanDetails(currentStore);
    const templateConfig = getStoreTemplateConfig(currentStore.template_slug);
    return reply.view('merchant/settings.ejs', {
        store: currentStore,
        templateConfig,
        allTemplates: STORE_TEMPLATES,
        storeCategories: STORE_CATEGORIES,
        isPro,
        planConfig: config
    });
});
// 8. Order Tracking View
fastify.get('/order/:ref', async (req, reply) => {
    const ref = req.params.ref;
    const order = dbFetchOne('orders', { order_ref: ref });
    if (!order)
        return reply.code(404).send('Order not found');
    const store = dbFetchOne('stores', { id: order.store_id });
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
    const order = dbFetchOne('orders', { order_ref: ref });
    if (!order)
        return reply.code(404).send('Receipt not found');
    const store = dbFetchOne('stores', { id: order.store_id });
    let items = [];
    try {
        items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
    }
    catch (e) { }
    return reply.view('receipt.ejs', { order, store, items });
});
// 10. Checkout Page View (/store/:slug/checkout or /:slug/checkout)
const renderCheckout = async (req, reply) => {
    const slug = req.params.slug;
    const store = dbFetchOne('stores', { slug });
    if (!store || store.status === 'deleted')
        return reply.code(404).send('Store not found');
    const templateConfig = getStoreTemplateConfig(store.template_slug);
    return reply.view('checkout.ejs', { store, templateConfig });
};
fastify.get('/store/:slug/checkout', renderCheckout);
fastify.get('/:slug/checkout', renderCheckout);
// 11. Template Live Demo / Sample Preview View (/demo/:slug or /preview/:slug)
const renderTemplateDemo = async (req, reply) => {
    const templateSlug = req.params.slug;
    const sampleData = getSampleDataForTemplate(templateSlug);
    const templateConfig = getStoreTemplateConfig(templateSlug);
    const categories = Array.from(new Set(sampleData.items.map(i => i.category || 'General')));
    return reply.view('store.ejs', {
        store: sampleData.store,
        items: sampleData.items,
        categories,
        templateConfig,
        allTemplates: STORE_TEMPLATES,
        isDemo: true
    });
};
fastify.get('/demo/:slug', renderTemplateDemo);
fastify.get('/preview/:slug', renderTemplateDemo);
// 12. Public Storefront View (/store/:slug or /:slug)
const renderStorefront = async (req, reply) => {
    const slug = req.params.slug;
    const store = dbFetchOne('stores', { slug });
    if (!store || store.status === 'deleted')
        return reply.code(404).send('Store not found');
    try {
        recordStoreVisit(store.id, req.ip, req.headers['user-agent']);
    }
    catch (e) { }
    const items = dbFetchAll('items', { store_id: store.id, is_available: 1 }, 'id DESC');
    const categories = Array.from(new Set(items.map(i => i.category || 'General')));
    const planDetails = getStorePlanDetails(store);
    const templateConfig = getStoreTemplateConfig(store.template_slug);
    return reply.view('store.ejs', {
        store,
        items,
        categories,
        templateConfig,
        allTemplates: STORE_TEMPLATES,
        isDemo: false,
        isPro: planDetails.isPro,
        showPoweredBy: Boolean(planDetails.config.features.powered_by_zlik)
    });
};
fastify.get('/store/:slug', renderStorefront);
fastify.get('/:slug', renderStorefront);
// Start High-Speed Server
const PORT = ENV.PORT;
const HOST = ENV.HOST;
try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`⚡ Zlik High-Speed Server running in [${ENV.NODE_ENV}] mode on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
}
catch (err) {
    console.error('⚡ Server listen error:', err);
    process.exit(1);
}
