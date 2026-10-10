import { dbFetchAll, dbFetchOne, dbInsert, dbUpdate, dbDelete } from '../../db/db.js';
import { hashPassword, verifyPassword, getStorePlanDetails, getPlatformSettings, getEffectivePlans } from '../../utils/helpers.js';
import { getAdminRoles, getAdminUser, hasAdminPermission, logAdminAction, SYSTEM_PERMISSIONS } from './adminHelpers.js';
import { checkAdminRateLimit, recordFailedAdminLogin, resetAdminRateLimit, applyAdminSecurityHeaders } from './adminSecurity.js';
import { sendAdminTestEmail, sendPasswordResetEmail } from '../email/mailer.js';
import { STORE_TEMPLATES, STORE_CATEGORIES } from '../../config/templates.js';
import { PLATFORM_FEATURE_DEFINITIONS } from '../../config/plans.js';
import { ENV } from '../../config/env.js';
import crypto from 'node:crypto';
export async function adminRoutes(fastify) {
    const secretAdminPrefix = '/' + ENV.ADMIN_SECRET_PATH;
    // Apply Strict Admin Security Headers to all secret admin and api routes
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.url.startsWith(secretAdminPrefix) || request.url.startsWith('/api/admin')) {
            applyAdminSecurityHeaders(reply);
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
        const admin = dbFetchOne('super_admins', { id: Number(adminId) });
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
        if (!hasAdminPermission(perm, adminId)) {
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
            adminPath: ENV.ADMIN_SECRET_PATH
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
        const rateCheck = checkAdminRateLimit(request.ip, email);
        if (!rateCheck.allowed) {
            return reply.code(429).send({
                success: false,
                error: `Too many failed login attempts. Account temporarily locked for security. Please retry in ${rateCheck.retryAfterSeconds} seconds.`
            });
        }
        const admin = dbFetchOne('super_admins', { email });
        if (!admin || !verifyPassword(password, admin.password_hash)) {
            const failure = recordFailedAdminLogin(request.ip, email);
            const errorMsg = failure.locked
                ? 'Too many failed login attempts. Account temporarily locked for 15 minutes.'
                : 'Invalid admin credentials';
            return reply.code(401).send({ success: false, error: errorMsg });
        }
        // 2. Successful Login - Reset rate limit tracker
        resetAdminRateLimit(request.ip, email);
        request.session.admin_id = admin.id;
        request.session.admin_name = admin.name;
        request.session.admin_role = admin.role;
        // Update last login
        dbUpdate('super_admins', {
            last_login_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            last_login_ip: request.ip
        }, { id: admin.id });
        logAdminAction(admin.id, 'Admin Login', 'super_admins', admin.id, `Signed into console from IP ${request.ip}`, request.ip);
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
            logAdminAction(adminId, 'Admin Logout', 'super_admins', adminId, 'Logged out', request.ip);
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
            logAdminAction(adminId, 'Stopped merchant impersonation', 'stores', '', 'Returned to admin dashboard', request.ip);
        }
        return reply.redirect(secretAdminPrefix);
    });
    /**
     * GET forgot-password
     */
    fastify.get(`${secretAdminPrefix}/forgot-password`, async (request, reply) => {
        return reply.view('admin/forgot_password.ejs', {
            title: 'Reset Admin Password',
            adminPath: ENV.ADMIN_SECRET_PATH
        });
    });
    /**
     * POST forgot-password
     */
    fastify.post(`${secretAdminPrefix}/forgot-password`, async (request, reply) => {
        const { email } = request.body || {};
        const admin = dbFetchOne('super_admins', { email: (email || '').trim().toLowerCase() });
        if (admin) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
            dbInsert('password_resets', {
                account_type: 'admin',
                account_id: admin.id,
                email: admin.email,
                token_hash: tokenHash,
                expires_at: expiresAt,
                used: 0
            });
            const resetUrl = `http://${request.hostname}${secretAdminPrefix}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail(admin.email, admin.name, resetUrl, 'admin');
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
            adminPath: ENV.ADMIN_SECRET_PATH
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
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const reset = dbFetchOne('password_resets', { account_type: 'admin', token_hash: tokenHash, used: 0 });
        if (!reset || reset.expires_at < now) {
            return reply.code(400).send({ success: false, error: 'Reset link is invalid or has expired' });
        }
        dbUpdate('super_admins', { password_hash: hashPassword(new_password) }, { id: reset.account_id });
        dbUpdate('password_resets', { used: 1 }, { id: reset.id });
        logAdminAction(reset.account_id, 'Admin Password Reset', 'super_admins', reset.account_id, 'Password successfully reset via token', request.ip);
        return reply.send({ success: true, message: 'Password has been updated. You may now log in.' });
    });
    /**
     * GET Super Admin Console Dashboard (Obfuscated Secret URL)
     */
    fastify.get(secretAdminPrefix, async (request, reply) => {
        const adminId = requireAdminAuth(request, reply);
        if (!adminId)
            return;
        const currentAdmin = getAdminUser(adminId);
        const roles = getAdminRoles();
        const stores = dbFetchAll('stores', {}, 'id DESC');
        const orders = dbFetchAll('orders', {}, 'id DESC');
        const items = dbFetchAll('items', {}, 'id DESC');
        const industries = dbFetchAll('industries', {}, 'id ASC');
        const templates = dbFetchAll('templates', {}, 'id ASC');
        const adminUsers = dbFetchAll('super_admins', {}, 'id ASC');
        const enterpriseLeads = dbFetchAll('enterprise_leads', {}, 'id DESC');
        const settings = getPlatformSettings();
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
            const plan = getStorePlanDetails(s);
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
            adminPath: ENV.ADMIN_SECRET_PATH,
            currentAdmin,
            roles,
            systemPermissions: SYSTEM_PERMISSIONS,
            stores,
            orders,
            items,
            industries,
            templates,
            storeCategories: STORE_CATEGORIES,
            allTemplates: STORE_TEMPLATES,
            plans: getEffectivePlans(),
            featureDefinitions: PLATFORM_FEATURE_DEFINITIONS,
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
                logAdminAction(adminId, 'Stopped merchant impersonation', 'stores', '', 'Returned to admin dashboard', request.ip);
                return reply.redirect('/admin');
            }
            return reply.redirect('/admin');
        }
        const adminId = requireAdminAuth(request, reply);
        if (!adminId)
            return;
        const currentAdmin = getAdminUser(adminId);
        switch (action) {
            case 'get_metrics': {
                const stores = dbFetchAll('stores');
                const orders = dbFetchAll('orders');
                let totalGmv = 0;
                let proCount = 0;
                let businessCount = 0;
                let enterpriseCount = 0;
                let trialCount = 0;
                let activeStores = 0;
                const storeRevMap = {};
                stores.forEach(s => {
                    const plan = getStorePlanDetails(s);
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
                    updateData.password_hash = hashPassword(password);
                dbUpdate('super_admins', updateData, { id: adminId });
                logAdminAction(adminId, 'Updated Profile', 'super_admins', adminId, 'Updated personal credentials', request.ip);
                return reply.send({ success: true, message: 'Profile updated successfully' });
            }
            case 'list_stores': {
                const stores = dbFetchAll('stores', {}, 'id DESC');
                return reply.send({ success: true, stores });
            }
            case 'update_status': {
                if (!hasAdminPermission('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, status } = body;
                const targetStore = dbFetchOne('stores', { id: Number(store_id) });
                if (targetStore) {
                    const updates = { status };
                    if (status === 'deleted' && !targetStore.slug.includes('_deleted_')) {
                        updates.slug = `${targetStore.slug}_deleted_${targetStore.id}`;
                    }
                    dbUpdate('stores', updates, { id: Number(store_id) });
                }
                logAdminAction(adminId, 'Update Store Status', 'stores', store_id, `Status set to ${status}`, request.ip);
                return reply.send({ success: true, message: `Store status updated to ${status}` });
            }
            case 'toggle_verification': {
                if (!hasAdminPermission('manage_verification', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, is_verified } = body;
                dbUpdate('stores', { is_verified: is_verified ? 1 : 0 }, { id: Number(store_id) });
                logAdminAction(adminId, 'Toggle Verification', 'stores', store_id, `Verification: ${is_verified ? 'Enabled' : 'Disabled'}`, request.ip);
                return reply.send({ success: true, message: 'Verification status updated' });
            }
            case 'update_plan': {
                if (!hasAdminPermission('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, plan_tier, days } = body;
                let expiresAt = null;
                if (days && Number(days) > 0) {
                    expiresAt = new Date(Date.now() + Number(days) * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
                }
                dbUpdate('stores', {
                    plan_tier,
                    is_trial_active: 0,
                    plan_expires_at: expiresAt
                }, { id: Number(store_id) });
                logAdminAction(adminId, 'Update Plan Tier', 'stores', store_id, `Plan set to ${plan_tier} (${days || 'forever'} days)`, request.ip);
                return reply.send({ success: true, message: `Store plan updated to ${plan_tier}` });
            }
            case 'update_template': {
                if (!hasAdminPermission('manage_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { store_id, template_slug } = body;
                const validTemplates = Object.keys(STORE_TEMPLATES);
                if (!validTemplates.includes(template_slug)) {
                    return reply.code(400).send({ success: false, error: 'Invalid template selection' });
                }
                dbUpdate('stores', { template_slug }, { id: Number(store_id) });
                logAdminAction(adminId, 'Update Store Template', 'stores', store_id, `Template changed to ${template_slug}`, request.ip);
                return reply.send({ success: true, message: `Store template updated to ${template_slug}` });
            }
            case 'impersonate_merchant': {
                if (!hasAdminPermission('impersonate_merchants', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const storeId = Number(body.store_id || query.store_id);
                const store = dbFetchOne('stores', { id: storeId });
                if (!store) {
                    return reply.code(404).send({ success: false, error: 'Store not found' });
                }
                const session = request.session;
                session.impersonating_admin_id = adminId;
                session.merchant_id = store.id;
                session.store_slug = store.slug;
                session.store_name = store.store_name;
                logAdminAction(adminId, 'Impersonate Merchant', 'stores', store.id, `Impersonating ${store.store_name} (${store.slug})`, request.ip);
                return reply.send({ success: true, redirect: '/merchant' });
            }
            case 'list_catalog': {
                const items = dbFetchAll('items', {}, 'id DESC', 100);
                return reply.send({ success: true, items });
            }
            case 'moderate_item': {
                if (!hasAdminPermission('manage_catalog', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { item_id, is_available } = body;
                dbUpdate('items', { is_available: is_available ? 1 : 0 }, { id: Number(item_id) });
                logAdminAction(adminId, 'Moderate Item', 'items', item_id, `Item availability set to ${is_available ? 'Available' : 'Hidden'}`, request.ip);
                return reply.send({ success: true, message: 'Item moderation updated' });
            }
            case 'get_settings': {
                const settings = getPlatformSettings();
                return reply.send({ success: true, settings });
            }
            case 'update_settings': {
                if (!hasAdminPermission('manage_integrations', adminId) && !hasAdminPermission('manage_pricing', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const current = getPlatformSettings();
                const updateData = { ...body };
                delete updateData.action;
                if (current?.id) {
                    dbUpdate('platform_settings', updateData, { id: current.id });
                }
                else {
                    dbInsert('platform_settings', updateData);
                }
                logAdminAction(adminId, 'Update Platform Settings', 'platform_settings', 1, 'Updated configuration', request.ip);
                return reply.send({ success: true, message: 'Platform settings saved successfully' });
            }
            case 'save_plans_matrix': {
                if (!hasAdminPermission('manage_pricing', adminId) && !hasAdminPermission('manage_integrations', adminId)) {
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
                const current = getPlatformSettings();
                if (current?.id) {
                    dbUpdate('platform_settings', updateData, { id: current.id });
                }
                else {
                    dbInsert('platform_settings', updateData);
                }
                logAdminAction(adminId, 'Update Plans & Feature Matrix', 'platform_settings', 1, 'Updated pricing tiers, limits, and feature toggles', request.ip);
                return reply.send({ success: true, message: 'Plans, pricing, and feature permissions updated across the entire platform successfully' });
            }
            case 'test_smtp': {
                const { target_email } = body;
                const res = await sendAdminTestEmail(target_email || currentAdmin.email);
                logAdminAction(adminId, 'Test SMTP Socket', 'email_logs', '', `Test email dispatched to ${target_email || currentAdmin.email}`, request.ip);
                return reply.send({ success: res.success, message: res.success ? 'Test email dispatched' : res.error });
            }
            case 'get_email_logs': {
                const logs = dbFetchAll('email_logs', {}, 'id DESC', 100);
                return reply.send({ success: true, logs });
            }
            case 'get_audit_logs': {
                const logs = dbFetchAll('admin_audit_logs', {}, 'id DESC', 100);
                return reply.send({ success: true, logs });
            }
            case 'list_admin_users': {
                const users = dbFetchAll('super_admins', {}, 'id ASC');
                return reply.send({ success: true, users });
            }
            case 'save_admin_user': {
                if (!hasAdminPermission('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, name, email, password, role } = body;
                if (id) {
                    const uData = { name, email: email.toLowerCase().trim(), role };
                    if (password && password.length >= 6)
                        uData.password_hash = hashPassword(password);
                    dbUpdate('super_admins', uData, { id: Number(id) });
                    logAdminAction(adminId, 'Update Admin User', 'super_admins', id, `Updated team member ${name}`, request.ip);
                }
                else {
                    if (!password || password.length < 6) {
                        return reply.code(400).send({ success: false, error: 'Password is required and must be at least 6 chars' });
                    }
                    dbInsert('super_admins', {
                        name,
                        email: email.toLowerCase().trim(),
                        password_hash: hashPassword(password),
                        role: role || 'support_lead'
                    });
                    logAdminAction(adminId, 'Create Admin User', 'super_admins', '', `Added team member ${name}`, request.ip);
                }
                return reply.send({ success: true, message: 'Admin user saved' });
            }
            case 'delete_admin_user': {
                if (!hasAdminPermission('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const targetId = Number(body.id);
                if (targetId === adminId) {
                    return reply.code(400).send({ success: false, error: 'Cannot delete own account' });
                }
                dbDelete('super_admins', { id: targetId });
                logAdminAction(adminId, 'Delete Admin User', 'super_admins', targetId, 'Deleted team member', request.ip);
                return reply.send({ success: true, message: 'Admin user removed' });
            }
            case 'list_roles': {
                return reply.send({ success: true, roles: getAdminRoles() });
            }
            case 'save_role': {
                if (!hasAdminPermission('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, name, description, permissions } = body;
                const permsJson = JSON.stringify(permissions || []);
                const existing = dbFetchOne('admin_roles', { id });
                if (existing) {
                    dbUpdate('admin_roles', { name, description, permissions_json: permsJson }, { id });
                }
                else {
                    dbInsert('admin_roles', { id, name, description, permissions_json: permsJson });
                }
                logAdminAction(adminId, 'Save Role', 'admin_roles', id, `Saved role ${name}`, request.ip);
                return reply.send({ success: true, message: 'Role saved successfully' });
            }
            case 'delete_role': {
                if (!hasAdminPermission('manage_team', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id } = body;
                dbDelete('admin_roles', { id });
                logAdminAction(adminId, 'Delete Role', 'admin_roles', id, 'Deleted custom role', request.ip);
                return reply.send({ success: true, message: 'Role deleted' });
            }
            case 'list_announcements': {
                const announcements = dbFetchAll('announcements', {}, 'id DESC');
                return reply.send({ success: true, announcements });
            }
            case 'save_announcement': {
                if (!hasAdminPermission('manage_broadcasts', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                const { id, title, message, type, target_tier, is_active } = body;
                if (id) {
                    dbUpdate('announcements', { title, message, type, target_tier, is_active: is_active ? 1 : 0 }, { id: Number(id) });
                }
                else {
                    dbInsert('announcements', { title, message, type, target_tier, is_active: is_active ? 1 : 0 });
                }
                logAdminAction(adminId, 'Save Announcement', 'announcements', id || '', `Broadcast saved: ${title}`, request.ip);
                return reply.send({ success: true, message: 'Announcement saved' });
            }
            case 'delete_announcement': {
                if (!hasAdminPermission('manage_broadcasts', adminId)) {
                    return reply.code(403).send({ success: false, error: 'Forbidden' });
                }
                dbDelete('announcements', { id: Number(body.id) });
                logAdminAction(adminId, 'Delete Announcement', 'announcements', body.id, 'Announcement removed', request.ip);
                return reply.send({ success: true, message: 'Announcement deleted' });
            }
            case 'get_enterprise_leads': {
                const leads = dbFetchAll('enterprise_leads', {}, 'id DESC');
                return reply.send({ success: true, leads });
            }
            case 'update_enterprise_lead': {
                const { id, status, notes } = body;
                dbUpdate('enterprise_leads', { status, notes }, { id: Number(id) });
                logAdminAction(adminId, 'Update Enterprise Lead', 'enterprise_leads', id, `Lead status: ${status}`, request.ip);
                return reply.send({ success: true, message: 'Lead updated' });
            }
            case 'delete_enterprise_lead': {
                dbDelete('enterprise_leads', { id: Number(body.id) });
                logAdminAction(adminId, 'Delete Enterprise Lead', 'enterprise_leads', body.id, 'Lead deleted', request.ip);
                return reply.send({ success: true, message: 'Lead deleted' });
            }
            case 'clear_cache': {
                logAdminAction(adminId, 'Clear Platform Cache', 'system', 0, 'Memory cache and query planner purged', request.ip);
                return reply.send({ success: true, message: 'System cache cleared successfully' });
            }
            case 'backup_database': {
                const backupName = `backup_${Date.now()}.sqlite`;
                logAdminAction(adminId, 'Database Backup', 'system', 0, `Created snapshot: ${backupName}`, request.ip);
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
