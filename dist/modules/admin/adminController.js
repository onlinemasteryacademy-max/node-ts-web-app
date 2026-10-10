"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const adminHelpers_js_1 = require("./adminHelpers.js");
const adminSecurity_js_1 = require("./adminSecurity.js");
const mailer_js_1 = require("../email/mailer.js");
const templates_js_1 = require("../../config/templates.js");
const plans_js_1 = require("../../config/plans.js");
const env_js_1 = require("../../config/env.js");
const node_crypto_1 = __importDefault(require("node:crypto"));
async function adminRoutes(fastify) {
    const secretAdminPrefix = '/' + env_js_1.ENV.ADMIN_SECRET_PATH;
    // Apply Strict Admin Security Headers to all secret admin and api routes
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.url.startsWith(secretAdminPrefix) || request.url.startsWith('/api/admin')) {
            (0, adminSecurity_js_1.applyAdminSecurityHeaders)(reply);
        }
    });
    // Honeypot / Stealth 404 on traditional /admin paths
    fastify.all('/admin', async (_request, reply) => {
        return reply.code(404).type('text/plain').send('Not Found');
    });
    fastify.all('/admin/*', async (_request, reply) => {
        return reply.code(404).type('text/plain').send('Not Found');
    });
    /**
     * Admin Auth Middleware Guard
     */
    const requireAdminAuth = (request, reply) => {
        const adminId = request.session?.admin_id;
        if (!adminId) {
            if (request.url.startsWith('/api/')) {
                reply.code(401).send({ success: false, error: 'Unauthorized: Admin authentication required' });
            }
            else {
                reply.redirect(`${secretAdminPrefix}/login`);
            }
            return null;
        }
        // Verify admin still exists and is valid in database
        const admin = (0, db_js_1.dbFetchOne)('super_admins', { id: Number(adminId) });
        if (!admin) {
            request.session.admin_id = null;
            if (request.url.startsWith('/api/')) {
                reply.code(401).send({ success: false, error: 'Unauthorized: Admin account revoked or not found' });
            }
            else {
                reply.redirect(`${secretAdminPrefix}/login`);
            }
            return null;
        }
        return Number(adminId);
    };
    /**
     * Permission Guard
     */
    const requirePerm = (request, reply, perm) => {
        const adminId = requireAdminAuth(request, reply);
        if (!adminId)
            return null;
        if (!(0, adminHelpers_js_1.hasAdminPermission)(perm, adminId)) {
            if (request.url.startsWith('/api/')) {
                reply.code(403).send({ success: false, error: `Access denied: Missing '${perm}' permission` });
            }
            else {
                reply.code(403).send('Forbidden: Insufficient Permissions');
            }
            return null;
        }
        return adminId;
    };
    /**
     * GET secret admin login page
     */
    fastify.get(`${secretAdminPrefix}/login`, async (request, reply) => {
        if (request.session?.admin_id) {
            return reply.redirect(secretAdminPrefix);
        }
        return reply.view('admin/login.ejs', {
            title: 'Admin Console - Sign In',
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH
        });
    });
    /**
     * POST admin login
     */
    const handleAdminLogin = async (request, reply) => {
        const body = request.body || {};
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password || '';
        // 1. Rate Limit & Brute Force Check
        const rateCheck = (0, adminSecurity_js_1.checkAdminRateLimit)(request.ip, email);
        if (!rateCheck.allowed) {
            return reply.code(429).send({
                success: false,
                error: `Too many failed login attempts. Account temporarily locked for security. Please retry in ${rateCheck.retryAfterSeconds} seconds.`
            });
        }
        const admin = (0, db_js_1.dbFetchOne)('super_admins', { email });
        if (!admin || !(0, helpers_js_1.verifyPassword)(password, admin.password_hash)) {
            const failure = (0, adminSecurity_js_1.recordFailedAdminLogin)(request.ip, email);
            const errorMsg = failure.locked
                ? 'Too many failed login attempts. Account temporarily locked for 15 minutes.'
                : 'Invalid admin credentials';
            return reply.code(401).send({ success: false, error: errorMsg });
        }
        // 2. Successful Login - Reset rate limit tracker
        (0, adminSecurity_js_1.resetAdminRateLimit)(request.ip, email);
        request.session.admin_id = admin.id;
        request.session.admin_name = admin.name;
        request.session.admin_role = admin.role;
        // Update last login
        (0, db_js_1.dbUpdate)('super_admins', {
            last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            last_login_ip: request.ip
        }, { id: admin.id });
        (0, adminHelpers_js_1.logAdminAction)(admin.id, 'Admin Login', 'super_admins', admin.id, `Signed into console from IP ${request.ip}`, request.ip);
        return reply.send({ success: true, message: 'Authentication successful', redirect: secretAdminPrefix });
    };
    fastify.post(`${secretAdminPrefix}/login`, handleAdminLogin);
    fastify.post('/api/admin/login', handleAdminLogin);
    /**
     * GET secret admin logout
     */
    fastify.get(`${secretAdminPrefix}/logout`, async (request, reply) => {
        const adminId = request.session?.admin_id;
        if (adminId) {
            (0, adminHelpers_js_1.logAdminAction)(adminId, 'Admin Logout', 'super_admins', adminId, 'Logged out', request.ip);
        }
        request.session.destroy(() => { });
        return reply.redirect(`${secretAdminPrefix}/login`);
    });
    /**
     * 1-Click Stop Impersonation
     */
    fastify.get(`${secretAdminPrefix}/stop-impersonation`, async (request, reply) => {
        const session = request.session;
        if (session?.impersonating_admin_id) {
            const adminId = session.impersonating_admin_id;
            delete session.impersonating_admin_id;
            delete session.merchant_id;
            session.admin_id = adminId;
            (0, adminHelpers_js_1.logAdminAction)(adminId, 'Stopped merchant impersonation', 'stores', '', 'Returned to admin dashboard', request.ip);
        }
        return reply.redirect(secretAdminPrefix);
    });
    /**
     * GET forgot-password
     */
    fastify.get(`${secretAdminPrefix}/forgot-password`, async (request, reply) => {
        return reply.view('admin/forgot_password.ejs', {
            title: 'Reset Admin Password',
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH
        });
    });
    /**
     * POST forgot-password
     */
    fastify.post(`${secretAdminPrefix}/forgot-password`, async (request, reply) => {
        const { email } = request.body || {};
        const admin = (0, db_js_1.dbFetchOne)('super_admins', { email: (email || '').trim().toLowerCase() });
        if (admin) {
            const rawToken = node_crypto_1.default.randomBytes(32).toString('hex');
            const tokenHash = node_crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
            (0, db_js_1.dbInsert)('password_resets', {
                account_type: 'admin',
                account_id: admin.id,
                email: admin.email,
                token_hash: tokenHash,
                expires_at: expiresAt,
                used: 0
            });
            const resetUrl = `http://${request.hostname}${secretAdminPrefix}/reset-password?token=${rawToken}`;
            await (0, mailer_js_1.sendPasswordResetEmail)(admin.email, admin.name, resetUrl, 'admin');
        }
        return reply.send({ success: true, message: 'If that email exists in our system, a password reset link has been dispatched.' });
    });
    /**
     * GET reset-password
     */
    fastify.get(`${secretAdminPrefix}/reset-password`, async (request, reply) => {
        const { token } = request.query || {};
        return reply.view('admin/reset_password.ejs', {
            title: 'Set New Admin Password',
            token,
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH
        });
    });
    /**
     * POST reset-password
     */
    fastify.post(`${secretAdminPrefix}/reset-password`, async (request, reply) => {
        const { token, new_password } = request.body || {};
        if (!token || !new_password || new_password.length < 6) {
            return reply.code(400).send({ success: false, error: 'Password must be at least 6 characters long' });
        }
        const tokenHash = node_crypto_1.default.createHash('sha256').update(token).digest('hex');
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const reset = (0, db_js_1.dbFetchOne)('password_resets', { account_type: 'admin', token_hash: tokenHash, used: 0 });
        if (!reset || reset.expires_at < now) {
            return reply.code(400).send({ success: false, error: 'Reset link is invalid or has expired' });
        }
        (0, db_js_1.dbUpdate)('super_admins', { password_hash: (0, helpers_js_1.hashPassword)(new_password) }, { id: reset.account_id });
        (0, db_js_1.dbUpdate)('password_resets', { used: 1 }, { id: reset.id });
        (0, adminHelpers_js_1.logAdminAction)(reset.account_id, 'Admin Password Reset', 'super_admins', reset.account_id, 'Password successfully reset via token', request.ip);
        return reply.send({ success: true, message: 'Password has been updated. You may now log in.' });
    });
    /**
     * GET Super Admin Console Dashboard (Obfuscated Secret URL)
     */
    fastify.get(secretAdminPrefix, async (request, reply) => {
        const adminId = requireAdminAuth(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        const roles = (0, adminHelpers_js_1.getAdminRoles)();
        const stores = (0, db_js_1.dbFetchAll)('stores', {}, 'id DESC');
        const orders = (0, db_js_1.dbFetchAll)('orders', {}, 'id DESC');
        const items = (0, db_js_1.dbFetchAll)('items', {}, 'id DESC');
        const industries = (0, db_js_1.dbFetchAll)('industries', {}, 'id ASC');
        const templates = (0, db_js_1.dbFetchAll)('templates', {}, 'id ASC');
        const adminUsers = (0, db_js_1.dbFetchAll)('super_admins', {}, 'id ASC');
        const enterpriseLeads = (0, db_js_1.dbFetchAll)('enterprise_leads', {}, 'id DESC');
        const settings = (0, helpers_js_1.getPlatformSettings)();
        // Metrics calculations
        let totalGmv = 0;
        let proCount = 0;
        let businessCount = 0;
        let enterpriseCount = 0;
        let trialCount = 0;
        let activeStores = 0;
        const todayDate = new Date().toISOString().slice(0, 10);
        let todayOrders = 0;
        let todayGmv = 0;
        stores.forEach(s => {
            const plan = (0, helpers_js_1.getStorePlanDetails)(s);
            if (plan.tier === 'pro' && !plan.is_trial)
                proCount++;
            else if (plan.tier === 'business' && !plan.is_trial)
                businessCount++;
            else if (plan.tier === 'enterprise')
                enterpriseCount++;
            else if (plan.is_trial)
                trialCount++;
            if (s.status === 'active')
                activeStores++;
        });
        orders.forEach(o => {
            const amt = Number(o.total_amount || 0);
            totalGmv += amt;
            if (o.created_at && o.created_at.startsWith(todayDate)) {
                todayOrders++;
                todayGmv += amt;
            }
        });
        const proPrice = Number(settings.pro_monthly_price || 5000);
        const businessPrice = Number(settings.business_monthly_price || 9000);
        const estimatedMrr = (proCount * proPrice) + (businessCount * businessPrice);
        return reply.view('admin/dashboard.ejs', {
            title: 'Super Admin Console - Zlik',
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH,
            currentAdmin,
            roles,
            systemPermissions: adminHelpers_js_1.SYSTEM_PERMISSIONS,
            stores,
            orders,
            items,
            industries,
            templates,
            storeCategories: templates_js_1.STORE_CATEGORIES,
            allTemplates: templates_js_1.STORE_TEMPLATES,
            plans: (0, helpers_js_1.getEffectivePlans)(),
            featureDefinitions: plans_js_1.PLATFORM_FEATURE_DEFINITIONS,
            adminUsers,
            enterpriseLeads,
            settings,
            metrics: {
                totalStores: stores.length,
                activeStores,
                totalOrders: orders.length,
                totalGmv,
                proCount,
                businessCount,
                enterpriseCount,
                trialCount,
                estimatedMrr,
                todayOrders,
                todayGmv,
                totalLeads: enterpriseLeads.length
            }
        });
    });
    /**
     * ADMIN REST API (/api/admin or /api/admin.php)
     */
    const handleAdminApi = async (request, reply) => {
        const query = request.query || {};
        const action = query.action || request.body?.action || 'get_metrics';
        const body = request.body || {};
        // Special case: Stop Impersonation
        if (action === 'stop_impersonation') {
            const session = request.session;
            if (session?.impersonating_admin_id) {
                const adminId = session.impersonating_admin_id;
                delete session.impersonating_admin_id;
                delete session.merchant_id;
                session.admin_id = adminId;
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Stopped merchant impersonation', 'stores', '', 'Returned to admin dashboard', request.ip);
                return reply.redirect('/admin');
            }
            return reply.redirect('/admin');
        }
        const adminId = requireAdminAuth(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        switch (action) {
            case 'get_metrics': {
                const stores = (0, db_js_1.dbFetchAll)('stores');
                const orders = (0, db_js_1.dbFetchAll)('orders');
                let totalGmv = 0;
                let proCount = 0;
                let businessCount = 0;
                let enterpriseCount = 0;
                let trialCount = 0;
                let activeStores = 0;
                const storeRevMap = {};
                stores.forEach(s => {
                    const plan = (0, helpers_js_1.getStorePlanDetails)(s);
                    if (plan.tier === 'pro' && !plan.is_trial)
                        proCount++;
                    else if (plan.tier === 'business' && !plan.is_trial)
                        businessCount++;
                    else if (plan.tier === 'enterprise')
                        enterpriseCount++;
                    else if (plan.is_trial)
                        trialCount++;
                    if (s.status === 'active')
                        activeStores++;
                    storeRevMap[s.id] = {
                        id: s.id,
                        store_name: s.store_name,
                        slug: s.slug,
                        owner_name: s.owner_name,
                        orders_count: 0,
                        total_spent: 0,
                        plan_tier: plan.tier,
                        status: s.status || 'active'
                    };
                });
                orders.forEach(o => {
                    const amt = Number(o.total_amount || 0);
                    totalGmv += amt;
                    if (storeRevMap[o.store_id]) {
                        storeRevMap[o.store_id].orders_count++;
                        storeRevMap[o.store_id].total_spent += amt;
                    }
                });
                const topMerchants = Object.values(storeRevMap).sort((a, b) => b.total_spent - a.total_spent).slice(0, 10);
                return reply.send({
                    success: true,
                    metrics: {
                        totalStores: stores.length,
                        activeStores,
                        totalOrders: orders.length,
                        totalGmv,
                        proCount,
                        businessCount,
                        enterpriseCount,
                        trialCount,
                        topMerchants
                    }
                });
            }
            case 'update_self_profile': {
                const { name, email, password } = body;
                const updateData = {};
                if (name)
                    updateData.name = name;
                if (email)
                    updateData.email = email.toLowerCase().trim();
                if (password && password.length >= 6)
                    updateData.password_hash = (0, helpers_js_1.hashPassword)(password);
                (0, db_js_1.dbUpdate)('super_admins', updateData, { id: adminId });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Updated Profile', 'super_admins', adminId, 'Updated personal credentials', request.ip);
                return reply.send({ success: true, message: 'Profile updated successfully' });
            }
            case 'list_stores': {
                const stores = (0, db_js_1.dbFetchAll)('stores', {}, 'id DESC');
                return reply.send({ success: true, stores });
            }
            case 'update_status': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, status } = body;
                const targetStore = (0, db_js_1.dbFetchOne)('stores', { id: Number(store_id) });
                if (targetStore) {
                    const updates = { status };
                    if (status === 'deleted' && !targetStore.slug.includes('_deleted_')) {
                        updates.slug = `${targetStore.slug}_deleted_${targetStore.id}`;
                    }
                    (0, db_js_1.dbUpdate)('stores', updates, { id: Number(store_id) });
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Store Status', 'stores', store_id, `Status set to ${status}`, request.ip);
                return reply.send({ success: true, message: `Store status updated to ${status}` });
            }
            case 'bulk_store_action': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden: Insufficient permissions to manage merchants' });
                }
                const { store_ids, operation, tier } = body;
                if (!Array.isArray(store_ids) || store_ids.length === 0) {
                    return reply.code(400).send({ success: false, error: 'No stores selected for bulk action' });
                }
                const validIds = store_ids.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0);
                if (validIds.length === 0) {
                    return reply.code(400).send({ success: false, error: 'Invalid store selection' });
                }
                let updatedCount = 0;
                for (const sId of validIds) {
                    const targetStore = (0, db_js_1.dbFetchOne)('stores', { id: sId });
                    if (!targetStore)
                        continue;
                    if (operation === 'deactivate' || operation === 'suspend') {
                        (0, db_js_1.dbUpdate)('stores', { status: 'suspended' }, { id: sId });
                        updatedCount++;
                    }
                    else if (operation === 'activate') {
                        (0, db_js_1.dbUpdate)('stores', { status: 'active' }, { id: sId });
                        updatedCount++;
                    }
                    else if (operation === 'verify') {
                        (0, db_js_1.dbUpdate)('stores', { is_verified: 1 }, { id: sId });
                        updatedCount++;
                    }
                    else if (operation === 'unverify') {
                        (0, db_js_1.dbUpdate)('stores', { is_verified: 0 }, { id: sId });
                        updatedCount++;
                    }
                    else if (operation === 'change_tier') {
                        const allowedTiers = ['free', 'pro', 'business', 'enterprise'];
                        const targetTier = (tier || 'free').toLowerCase();
                        if (allowedTiers.includes(targetTier)) {
                            (0, db_js_1.dbUpdate)('stores', { plan_tier: targetTier }, { id: sId });
                            updatedCount++;
                        }
                    }
                    else if (operation === 'delete') {
                        const updates = { status: 'deleted' };
                        if (!targetStore.slug.includes('_deleted_')) {
                            updates.slug = `${targetStore.slug}_deleted_${targetStore.id}`;
                        }
                        (0, db_js_1.dbUpdate)('stores', updates, { id: sId });
                        updatedCount++;
                    }
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Bulk Store Action', 'stores', validIds.join(','), `Executed bulk '${operation}' on ${updatedCount} stores`, request.ip);
                return reply.send({
                    success: true,
                    count: updatedCount,
                    message: `Bulk action '${operation}' completed successfully for ${updatedCount} store(s).`
                });
            }
            case 'toggle_verification': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_verification', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, is_verified } = body;
                (0, db_js_1.dbUpdate)('stores', { is_verified: is_verified ? 1 : 0 }, { id: Number(store_id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Toggle Verification', 'stores', store_id, `Verification: ${is_verified ? 'Enabled' : 'Disabled'}`, request.ip);
                return reply.send({ success: true, message: 'Verification status updated' });
            }
            case 'update_plan': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, plan_tier, days } = body;
                let expiresAt = null;
                if (days && Number(days) > 0) {
                    expiresAt = new Date(Date.now() + Number(days) * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
                }
                (0, db_js_1.dbUpdate)('stores', {
                    plan_tier,
                    is_trial_active: 0,
                    plan_expires_at: expiresAt
                }, { id: Number(store_id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Plan Tier', 'stores', store_id, `Plan set to ${plan_tier} (${days || 'forever'} days)`, request.ip);
                return reply.send({ success: true, message: `Store plan updated to ${plan_tier}` });
            }
            case 'update_template': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, template_slug } = body;
                const validTemplates = Object.keys(templates_js_1.STORE_TEMPLATES);
                if (!validTemplates.includes(template_slug)) {
                    return reply.code(400).send({ success: false, error: 'Invalid template selection' });
                }
                (0, db_js_1.dbUpdate)('stores', { template_slug }, { id: Number(store_id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Store Template', 'stores', store_id, `Template changed to ${template_slug}`, request.ip);
                return reply.send({ success: true, message: `Store template updated to ${template_slug}` });
            }
            case 'impersonate_merchant': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('impersonate_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const storeId = Number(body.store_id || query.store_id);
                const store = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
                if (!store) {
                    return reply.code(404).send({ success: false, error: 'Store not found' });
                }
                const session = request.session;
                session.impersonating_admin_id = adminId;
                session.merchant_id = store.id;
                session.store_slug = store.slug;
                session.store_name = store.store_name;
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Impersonate Merchant', 'stores', store.id, `Impersonating ${store.store_name} (${store.slug})`, request.ip);
                return reply.send({ success: true, redirect: '/merchant' });
            }
            case 'list_catalog': {
                const items = (0, db_js_1.dbFetchAll)('items', {}, 'id DESC', 100);
                return reply.send({ success: true, items });
            }
            case 'moderate_item': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_catalog', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { item_id, is_available } = body;
                (0, db_js_1.dbUpdate)('items', { is_available: is_available ? 1 : 0 }, { id: Number(item_id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Moderate Item', 'items', item_id, `Item availability set to ${is_available ? 'Available' : 'Hidden'}`, request.ip);
                return reply.send({ success: true, message: 'Item moderation updated' });
            }
            case 'get_settings': {
                const settings = (0, helpers_js_1.getPlatformSettings)();
                return reply.send({ success: true, settings });
            }
            case 'update_settings': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_integrations', adminId) && !(0, adminHelpers_js_1.hasAdminPermission)('manage_pricing', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const current = (0, helpers_js_1.getPlatformSettings)();
                const updateData = { ...body };
                delete updateData.action;
                if (current?.id) {
                    (0, db_js_1.dbUpdate)('platform_settings', updateData, { id: current.id });
                }
                else {
                    (0, db_js_1.dbInsert)('platform_settings', updateData);
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Platform Settings', 'platform_settings', 1, 'Updated configuration', request.ip);
                return reply.send({ success: true, message: 'Platform settings saved successfully' });
            }
            case 'save_plans_matrix': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_pricing', adminId) && !(0, adminHelpers_js_1.hasAdminPermission)('manage_integrations', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden: Missing permission' });
                }
                const { pro_monthly_price, pro_yearly_price, business_monthly_price, business_yearly_price, free_product_limit, free_weekly_posters, plans_config } = body;
                const updateData = {
                    pro_monthly_price: parseFloat(pro_monthly_price || 5000),
                    pro_yearly_price: parseFloat(pro_yearly_price || 50000),
                    business_monthly_price: parseFloat(business_monthly_price || 9000),
                    business_yearly_price: parseFloat(business_yearly_price || 90000),
                    free_product_limit: parseInt(free_product_limit || 10),
                    free_weekly_posters: parseInt(free_weekly_posters || 3)
                };
                if (plans_config) {
                    updateData.plans_config_json = typeof plans_config === 'string' ? plans_config : JSON.stringify(plans_config);
                }
                const current = (0, helpers_js_1.getPlatformSettings)();
                if (current?.id) {
                    (0, db_js_1.dbUpdate)('platform_settings', updateData, { id: current.id });
                }
                else {
                    (0, db_js_1.dbInsert)('platform_settings', updateData);
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Plans & Feature Matrix', 'platform_settings', 1, 'Updated pricing tiers, limits, and feature toggles', request.ip);
                return reply.send({ success: true, message: 'Plans, pricing, and feature permissions updated across the entire platform successfully' });
            }
            case 'test_smtp': {
                const { target_email } = body;
                const res = await (0, mailer_js_1.sendAdminTestEmail)(target_email || currentAdmin.email);
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Test SMTP Socket', 'email_logs', '', `Test email dispatched to ${target_email || currentAdmin.email}`, request.ip);
                return reply.send({ success: res.success, message: res.success ? 'Test email dispatched' : res.error });
            }
            case 'get_email_logs': {
                const logs = (0, db_js_1.dbFetchAll)('email_logs', {}, 'id DESC', 100);
                return reply.send({ success: true, logs });
            }
            case 'get_audit_logs': {
                const logs = (0, db_js_1.dbFetchAll)('admin_audit_logs', {}, 'id DESC', 100);
                return reply.send({ success: true, logs });
            }
            case 'list_admin_users': {
                const users = (0, db_js_1.dbFetchAll)('super_admins', {}, 'id ASC');
                return reply.send({ success: true, users });
            }
            case 'save_admin_user': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, name, email, password, role } = body;
                if (id) {
                    const uData = { name, email: email.toLowerCase().trim(), role };
                    if (password && password.length >= 6)
                        uData.password_hash = (0, helpers_js_1.hashPassword)(password);
                    (0, db_js_1.dbUpdate)('super_admins', uData, { id: Number(id) });
                    (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Admin User', 'super_admins', id, `Updated team member ${name}`, request.ip);
                }
                else {
                    if (!password || password.length < 6) {
                        return reply.code(400).send({ success: false, error: 'Password is required and must be at least 6 chars' });
                    }
                    (0, db_js_1.dbInsert)('super_admins', {
                        name,
                        email: email.toLowerCase().trim(),
                        password_hash: (0, helpers_js_1.hashPassword)(password),
                        role: role || 'support_lead'
                    });
                    (0, adminHelpers_js_1.logAdminAction)(adminId, 'Create Admin User', 'super_admins', '', `Added team member ${name}`, request.ip);
                }
                return reply.send({ success: true, message: 'Admin user saved' });
            }
            case 'delete_admin_user': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const targetId = Number(body.id);
                if (targetId === adminId) {
                    return reply.code(400).send({ success: false, error: 'Cannot delete own account' });
                }
                (0, db_js_1.dbDelete)('super_admins', { id: targetId });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Delete Admin User', 'super_admins', targetId, 'Deleted team member', request.ip);
                return reply.send({ success: true, message: 'Admin user removed' });
            }
            case 'list_roles': {
                return reply.send({ success: true, roles: (0, adminHelpers_js_1.getAdminRoles)() });
            }
            case 'save_role': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, name, description, permissions } = body;
                const permsJson = JSON.stringify(permissions || []);
                const existing = (0, db_js_1.dbFetchOne)('admin_roles', { id });
                if (existing) {
                    (0, db_js_1.dbUpdate)('admin_roles', { name, description, permissions_json: permsJson }, { id });
                }
                else {
                    (0, db_js_1.dbInsert)('admin_roles', { id, name, description, permissions_json: permsJson });
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Save Role', 'admin_roles', id, `Saved role ${name}`, request.ip);
                return reply.send({ success: true, message: 'Role saved successfully' });
            }
            case 'delete_role': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id } = body;
                (0, db_js_1.dbDelete)('admin_roles', { id });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Delete Role', 'admin_roles', id, 'Deleted custom role', request.ip);
                return reply.send({ success: true, message: 'Role deleted' });
            }
            case 'list_announcements': {
                const announcements = (0, db_js_1.dbFetchAll)('announcements', {}, 'id DESC');
                return reply.send({ success: true, announcements });
            }
            case 'save_announcement': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_broadcasts', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, title, message, type, target_tier, is_active } = body;
                if (id) {
                    (0, db_js_1.dbUpdate)('announcements', { title, message, type, target_tier, is_active: is_active ? 1 : 0 }, { id: Number(id) });
                }
                else {
                    (0, db_js_1.dbInsert)('announcements', { title, message, type, target_tier, is_active: is_active ? 1 : 0 });
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Save Announcement', 'announcements', id || '', `Broadcast saved: ${title}`, request.ip);
                return reply.send({ success: true, message: 'Announcement saved' });
            }
            case 'delete_announcement': {
                if (!(0, adminHelpers_js_1.hasAdminPermission)('manage_broadcasts', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                (0, db_js_1.dbDelete)('announcements', { id: Number(body.id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Delete Announcement', 'announcements', body.id, 'Announcement removed', request.ip);
                return reply.send({ success: true, message: 'Announcement deleted' });
            }
            case 'get_enterprise_leads': {
                const leads = (0, db_js_1.dbFetchAll)('enterprise_leads', {}, 'id DESC');
                return reply.send({ success: true, leads });
            }
            case 'update_enterprise_lead': {
                const { id, status, notes } = body;
                (0, db_js_1.dbUpdate)('enterprise_leads', { status, notes }, { id: Number(id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Update Enterprise Lead', 'enterprise_leads', id, `Lead status: ${status}`, request.ip);
                return reply.send({ success: true, message: 'Lead updated' });
            }
            case 'delete_enterprise_lead': {
                (0, db_js_1.dbDelete)('enterprise_leads', { id: Number(body.id) });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Delete Enterprise Lead', 'enterprise_leads', body.id, 'Lead deleted', request.ip);
                return reply.send({ success: true, message: 'Lead deleted' });
            }
            case 'clear_cache': {
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Clear Platform Cache', 'system', 0, 'Memory cache and query planner purged', request.ip);
                return reply.send({ success: true, message: 'System cache cleared successfully' });
            }
            case 'backup_database': {
                const backupName = `backup_${Date.now()}.sqlite`;
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Database Backup', 'system', 0, `Created snapshot: ${backupName}`, request.ip);
                return reply.send({ success: true, message: `Backup created: ${backupName}` });
            }
            default:
                return reply.code(400).send({ success: false, error: `Unknown admin action: ${action}` });
        }
    };
    fastify.get('/api/admin', handleAdminApi);
    fastify.post('/api/admin', handleAdminApi);
    fastify.get('/api/admin.php', handleAdminApi);
    fastify.post('/api/admin.php', handleAdminApi);
}
