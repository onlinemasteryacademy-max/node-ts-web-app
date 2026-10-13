"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSecurityRoutes = adminSecurityRoutes;
const db_js_1 = require("../../db/db.js");
const env_js_1 = require("../../config/env.js");
const adminHelpers_js_1 = require("./adminHelpers.js");
const adminSecurity_js_1 = require("./adminSecurity.js");
const securityService_js_1 = require("../security/securityService.js");
const businessVerificationService_js_1 = require("../verification/businessVerificationService.js");
async function adminSecurityRoutes(fastify) {
    const secretAdminPrefix = '/' + env_js_1.ENV.ADMIN_SECRET_PATH;
    // Apply Strict Admin Security Headers
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.url.startsWith(`${secretAdminPrefix}/security`) ||
            request.url.startsWith('/api/admin/security')) {
            (0, adminSecurity_js_1.applyAdminSecurityHeaders)(reply);
        }
    });
    /**
     * Admin Authentication & Security Permission Guard
     */
    const requireSecurityAdmin = (request, reply) => {
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
        const admin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        if (!admin) {
            request.session.admin_id = null;
            if (request.url.startsWith('/api/')) {
                reply.code(401).send({ success: false, error: 'Unauthorized: Admin account revoked' });
            }
            else {
                reply.redirect(`${secretAdminPrefix}/login`);
            }
            return null;
        }
        // Must have security or verification permissions or super admin
        const canAccess = (0, adminHelpers_js_1.hasAdminPermission)('manage_security', adminId) ||
            (0, adminHelpers_js_1.hasAdminPermission)('manage_verification', adminId) ||
            (0, adminHelpers_js_1.hasAdminPermission)('*', adminId);
        if (!canAccess) {
            if (request.url.startsWith('/api/')) {
                reply.code(403).send({ success: false, error: 'Access denied: Requires Trust & Safety permission' });
            }
            else {
                reply.code(403).send('Forbidden: Insufficient Trust & Safety permissions');
            }
            return null;
        }
        return Number(adminId);
    };
    /**
     * Helper: Gather Platform-wide Security Metrics
     */
    const getSecurityMetrics = () => {
        const sellers = (0, db_js_1.dbFetchAll)('seller_profiles');
        const reports = (0, db_js_1.dbFetchAll)('fraud_reports');
        const configs = (0, db_js_1.dbFetchAll)('verification_provider_configs');
        let verifiedPersonal = 0;
        let verifiedBusiness = 0;
        let pendingQueue = 0;
        let flaggedHighRisk = 0;
        let orderGatedCount = 0;
        for (const s of sellers) {
            if (s.composite_verification_status === 'verified') {
                if (s.seller_type === 'business')
                    verifiedBusiness++;
                else
                    verifiedPersonal++;
            }
            if (s.composite_verification_status === 'pending' || s.composite_verification_status === 'under_review') {
                pendingQueue++;
            }
            if (s.risk_level === 'high' || s.risk_level === 'critical') {
                flaggedHighRisk++;
            }
            if (Number(s.order_gating_enabled) === 1) {
                orderGatedCount++;
            }
        }
        let openFraudReports = 0;
        for (const r of reports) {
            if (r.status === 'new' || r.status === 'under_review') {
                openFraudReports++;
            }
        }
        const monnifyConfig = configs.find(c => c.provider_key === 'monnify') || null;
        return {
            totalSellers: sellers.length,
            verifiedPersonal,
            verifiedBusiness,
            totalVerified: verifiedPersonal + verifiedBusiness,
            pendingQueue,
            flaggedHighRisk,
            openFraudReports,
            totalFraudReports: reports.length,
            orderGatedCount,
            providerStatus: monnifyConfig ? monnifyConfig.status : 'not_configured',
            providerEnvironment: monnifyConfig ? monnifyConfig.environment : 'sandbox'
        };
    };
    /**
     * GET /${ENV.ADMIN_SECRET_PATH}/security
     * Main Security & Trust Dashboard Overview
     */
    fastify.get(`${secretAdminPrefix}/security`, async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        const metrics = getSecurityMetrics();
        // Recent items for overview feed
        const sellers = (0, db_js_1.dbFetchAll)('seller_profiles', {}, 'id DESC', 10);
        const storesMap = new Map();
        for (const s of sellers) {
            if (!storesMap.has(s.store_id)) {
                const store = (0, db_js_1.dbFetchOne)('stores', { id: s.store_id });
                if (store)
                    storesMap.set(s.store_id, store);
            }
        }
        const enrichedSellers = sellers.map(s => ({
            ...s,
            store: storesMap.get(s.store_id) || null
        }));
        const recentRiskEvents = (0, db_js_1.dbFetchAll)('risk_events', {}, 'id DESC', 8);
        const recentAuditLogs = (0, db_js_1.dbFetchAll)('security_audit_logs', {}, 'id DESC', 10);
        const recentReports = (0, db_js_1.dbFetchAll)('fraud_reports', {}, 'id DESC', 6);
        return reply.view('admin/security/overview.ejs', {
            title: 'Security & Trust Console - Zlik',
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH,
            currentAdmin,
            metrics,
            recentSellers: enrichedSellers,
            recentRiskEvents,
            recentAuditLogs,
            recentReports
        });
    });
    /**
     * GET /${ENV.ADMIN_SECRET_PATH}/security/queue
     * Verification & Risk Review Queue
     */
    fastify.get(`${secretAdminPrefix}/security/queue`, async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        const query = request.query || {};
        const statusFilter = query.status || 'all';
        const typeFilter = query.type || 'all';
        const riskFilter = query.risk || 'all';
        const searchQuery = (query.search || '').trim().toLowerCase();
        const allSellers = (0, db_js_1.dbFetchAll)('seller_profiles', {}, 'id DESC');
        const storesMap = new Map();
        const bankAccountsMap = new Map();
        const filtered = allSellers.filter(s => {
            if (statusFilter !== 'all' && s.composite_verification_status !== statusFilter)
                return false;
            if (typeFilter !== 'all' && s.seller_type !== typeFilter)
                return false;
            if (riskFilter !== 'all' && s.risk_level !== riskFilter)
                return false;
            const store = (0, db_js_1.dbFetchOne)('stores', { id: s.store_id });
            if (store)
                storesMap.set(s.store_id, store);
            if (!bankAccountsMap.has(s.id)) {
                const bank = (0, db_js_1.dbFetchOne)('seller_bank_accounts', { seller_id: s.id, is_active: 1 });
                bankAccountsMap.set(s.id, bank || null);
            }
            if (searchQuery) {
                const storeName = (store?.store_name || '').toLowerCase();
                const storeSlug = (store?.slug || '').toLowerCase();
                const ownerName = (store?.owner_name || '').toLowerCase();
                const legalName = (s.legal_name || '').toLowerCase();
                if (!storeName.includes(searchQuery) &&
                    !storeSlug.includes(searchQuery) &&
                    !ownerName.includes(searchQuery) &&
                    !legalName.includes(searchQuery)) {
                    return false;
                }
            }
            return true;
        });
        const enrichedQueue = filtered.map(s => ({
            ...s,
            store: storesMap.get(s.store_id) || null,
            bank: bankAccountsMap.get(s.id) || null
        }));
        return reply.view('admin/security/queue.ejs', {
            title: 'Verification Queue - Zlik Trust Console',
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH,
            currentAdmin,
            queue: enrichedQueue,
            filters: {
                status: statusFilter,
                type: typeFilter,
                risk: riskFilter,
                search: query.search || ''
            },
            metrics: getSecurityMetrics()
        });
    });
    /**
     * GET /${ENV.ADMIN_SECRET_PATH}/security/seller/:id
     * 360-degree Seller Investigation & Risk Profile
     */
    fastify.get(`${secretAdminPrefix}/security/seller/:id`, async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        const sellerId = Number(request.params?.id);
        if (!sellerId) {
            return reply.redirect(`${secretAdminPrefix}/security/queue`);
        }
        const seller = (0, db_js_1.dbFetchOne)('seller_profiles', { id: sellerId });
        if (!seller) {
            return reply.code(404).send('Seller Profile Not Found');
        }
        const store = (0, db_js_1.dbFetchOne)('stores', { id: seller.store_id });
        const business = (0, db_js_1.dbFetchOne)('business_profiles', { seller_id: seller.id });
        const bankAccounts = (0, db_js_1.dbFetchAll)('seller_bank_accounts', { seller_id: seller.id }, 'id DESC');
        const verifications = (0, db_js_1.dbFetchAll)('seller_verifications', { seller_id: seller.id }, 'id DESC');
        const fraudReports = store ? (0, db_js_1.dbFetchAll)('fraud_reports', { reported_store_id: store.id }, 'id DESC') : [];
        const riskEvents = (0, db_js_1.dbFetchAll)('risk_events', { seller_id: seller.id }, 'id DESC');
        // Security audit logs relating to this seller or store
        const auditLogs = (0, db_js_1.dbFetchAll)('security_audit_logs', {}, 'id DESC', 50).filter(l => (l.target_type === 'seller_profiles' && Number(l.target_id) === seller.id) ||
            (l.target_type === 'stores' && store && Number(l.target_id) === store.id));
        // Store operational stats
        let totalOrders = 0;
        let totalGmv = 0;
        let totalProducts = 0;
        if (store) {
            const orders = (0, db_js_1.dbFetchAll)('orders', { store_id: store.id });
            totalOrders = orders.length;
            totalGmv = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
            const items = (0, db_js_1.dbFetchAll)('items', { store_id: store.id });
            totalProducts = items.length;
        }
        return reply.view('admin/security/investigate.ejs', {
            title: `Investigate Seller #${seller.id} - Zlik Trust Console`,
            adminPath: env_js_1.ENV.ADMIN_SECRET_PATH,
            currentAdmin,
            seller,
            store,
            business,
            bankAccounts,
            verifications,
            fraudReports,
            riskEvents,
            auditLogs,
            stats: {
                totalOrders,
                totalGmv,
                totalProducts
            }
        });
    });
    /**
     * POST /api/admin/security/action
     * Perform Administrative Trust & Verification Actions
     */
    fastify.post('/api/admin/security/action', async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const currentAdmin = (0, adminHelpers_js_1.getAdminUser)(adminId);
        const body = request.body || {};
        const { action, seller_id, reason, details } = body;
        const sellerId = Number(seller_id);
        if (!action || !sellerId) {
            return reply.code(400).send({ success: false, error: 'Missing action or seller_id' });
        }
        const seller = (0, db_js_1.dbFetchOne)('seller_profiles', { id: sellerId });
        if (!seller) {
            return reply.code(404).send({ success: false, error: 'Seller profile not found' });
        }
        const store = (0, db_js_1.dbFetchOne)('stores', { id: seller.store_id });
        const ip = request.ip;
        const actionReason = (reason || '').trim() || 'Super Admin manual security action';
        switch (action) {
            case 'approve_verification': {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                (0, db_js_1.dbUpdate)('seller_profiles', {
                    composite_verification_status: 'verified',
                    identity_status: 'verified',
                    bank_status: seller.bank_status === 'pending' ? 'verified' : seller.bank_status,
                    updated_at: now
                }, { id: seller.id });
                if (store) {
                    (0, db_js_1.dbUpdate)('stores', { is_verified: 1 }, { id: store.id });
                }
                // Mark active bank account as verified
                const activeBank = (0, db_js_1.dbFetchOne)('seller_bank_accounts', { seller_id: seller.id, is_active: 1 });
                if (activeBank) {
                    (0, db_js_1.dbUpdate)('seller_bank_accounts', {
                        verification_status: 'verified',
                        verified_at: now,
                        updated_at: now
                    }, { id: activeBank.id });
                }
                // Record verification event
                (0, db_js_1.dbInsert)('seller_verifications', {
                    seller_id: seller.id,
                    verification_type: 'manual_admin',
                    provider: 'admin_override',
                    provider_reference: `ADM-${adminId}-${Date.now()}`,
                    status: 'verified',
                    result_code: 'ADMIN_APPROVED',
                    verified_at: now
                });
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: 'Approve Seller Verification',
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Approved seller verification', 'seller_profiles', seller.id, actionReason, ip);
                return reply.send({ success: true, message: 'Seller verification successfully approved.' });
            }
            case 'reject_verification': {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                (0, db_js_1.dbUpdate)('seller_profiles', {
                    composite_verification_status: 'rejected',
                    identity_status: 'rejected',
                    updated_at: now
                }, { id: seller.id });
                if (store) {
                    (0, db_js_1.dbUpdate)('stores', { is_verified: 0 }, { id: store.id });
                }
                // Record verification rejection
                (0, db_js_1.dbInsert)('seller_verifications', {
                    seller_id: seller.id,
                    verification_type: 'manual_admin',
                    provider: 'admin_override',
                    provider_reference: `ADM-${adminId}-${Date.now()}`,
                    status: 'rejected',
                    result_code: 'ADMIN_REJECTED',
                    failure_reason: actionReason
                });
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: 'Reject Seller Verification',
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Rejected seller verification', 'seller_profiles', seller.id, actionReason, ip);
                return reply.send({ success: true, message: 'Seller verification rejected.' });
            }
            case 'toggle_order_gating': {
                const currentVal = Number(seller.order_gating_enabled);
                const newVal = currentVal === 1 ? 0 : 1;
                (0, db_js_1.dbUpdate)('seller_profiles', {
                    order_gating_enabled: newVal,
                    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
                }, { id: seller.id });
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: newVal === 1 ? 'Enable Order Gating' : 'Disable Order Gating',
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                return reply.send({
                    success: true,
                    order_gating_enabled: newVal,
                    message: newVal === 1 ? 'Order gating enabled (orders allowed).' : 'Order gating disabled (store cannot accept orders).'
                });
            }
            case 'suspend_store': {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                (0, db_js_1.dbUpdate)('seller_profiles', {
                    composite_verification_status: 'suspended',
                    updated_at: now
                }, { id: seller.id });
                if (store) {
                    (0, db_js_1.dbUpdate)('stores', {
                        status: 'suspended'
                    }, { id: store.id });
                }
                (0, securityService_js_1.recordRiskEvent)({
                    seller_id: seller.id,
                    event_type: 'ADMIN_SUSPENSION',
                    score_delta: 50,
                    reason_code: 'ADMIN_SUSPENDED',
                    metadata: { adminId, reason: actionReason }
                });
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: 'Suspend Storefront & Seller',
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Suspended store', 'stores', store?.id || 0, actionReason, ip);
                return reply.send({ success: true, message: 'Storefront suspended immediately.' });
            }
            case 'restore_store': {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                (0, db_js_1.dbUpdate)('seller_profiles', {
                    composite_verification_status: 'verified',
                    updated_at: now
                }, { id: seller.id });
                if (store) {
                    (0, db_js_1.dbUpdate)('stores', {
                        status: 'active'
                    }, { id: store.id });
                }
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: 'Restore Storefront & Seller',
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Restored store', 'stores', store?.id || 0, actionReason, ip);
                return reply.send({ success: true, message: 'Storefront restored to active status.' });
            }
            case 'adjust_risk': {
                const delta = Number(details?.delta || 0);
                if (!delta) {
                    return reply.code(400).send({ success: false, error: 'Risk score delta required' });
                }
                (0, securityService_js_1.recordRiskEvent)({
                    seller_id: seller.id,
                    event_type: 'MANUAL_ADJUSTMENT',
                    score_delta: delta,
                    reason_code: details?.reason_code || 'ADMIN_ADJUSTMENT',
                    metadata: { adminId, note: actionReason }
                });
                (0, securityService_js_1.logSecurityAudit)({
                    actor_type: 'super_admin',
                    actor_id: adminId,
                    action: `Manual Risk Score Adjustment (${delta > 0 ? '+' : ''}${delta})`,
                    target_type: 'seller_profiles',
                    target_id: seller.id,
                    reason: actionReason,
                    ip_address: ip
                });
                return reply.send({ success: true, message: 'Risk score updated.' });
            }
            case 'approve_business': {
                const bus = (0, db_js_1.dbFetchOne)('business_profiles', { seller_id: seller.id });
                if (!bus) {
                    return reply.code(400).send({ success: false, error: 'No CAC business profile found for this seller' });
                }
                const appRes = (0, businessVerificationService_js_1.approveBusinessVerification)({
                    businessProfileId: bus.id,
                    adminId,
                    adminName: currentAdmin?.name || 'Super Admin',
                    notes: actionReason,
                    ipAddress: ip
                });
                if (!appRes.success) {
                    return reply.code(400).send(appRes);
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Approved CAC business verification', 'business_profiles', bus.id, actionReason, ip);
                return reply.send({ success: true, message: 'CAC registered business successfully verified.' });
            }
            case 'reject_business': {
                const bus = (0, db_js_1.dbFetchOne)('business_profiles', { seller_id: seller.id });
                if (!bus) {
                    return reply.code(400).send({ success: false, error: 'No CAC business profile found for this seller' });
                }
                const rejRes = (0, businessVerificationService_js_1.rejectBusinessVerification)({
                    businessProfileId: bus.id,
                    adminId,
                    adminName: currentAdmin?.name || 'Super Admin',
                    reason: actionReason,
                    ipAddress: ip
                });
                if (!rejRes.success) {
                    return reply.code(400).send(rejRes);
                }
                (0, adminHelpers_js_1.logAdminAction)(adminId, 'Rejected CAC business verification', 'business_profiles', bus.id, actionReason, ip);
                return reply.send({ success: true, message: 'CAC business verification rejected.' });
            }
            default:
                return reply.code(400).send({ success: false, error: `Unknown security action '${action}'` });
        }
    });
    /**
     * POST /api/admin/security/report/:id/status
     * Update Customer Fraud Report / Dispute Status
     */
    fastify.post('/api/admin/security/report/:id/status', async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const reportId = Number(request.params?.id);
        const body = request.body || {};
        const { status, resolution_code, resolution_summary } = body;
        const report = (0, db_js_1.dbFetchOne)('fraud_reports', { id: reportId });
        if (!report) {
            return reply.code(404).send({ success: false, error: 'Fraud report not found' });
        }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        (0, db_js_1.dbUpdate)('fraud_reports', {
            status: status || report.status,
            resolution_code: resolution_code || report.resolution_code,
            resolution_summary: resolution_summary || report.resolution_summary,
            assigned_admin_id: adminId,
            updated_at: now
        }, { id: reportId });
        (0, db_js_1.dbInsert)('fraud_case_events', {
            case_id: reportId,
            actor_type: 'super_admin',
            actor_id: adminId,
            event_type: 'STATUS_UPDATE',
            message: `Status updated to '${status}'. Summary: ${resolution_summary || 'N/A'}`
        });
        (0, securityService_js_1.logSecurityAudit)({
            actor_type: 'super_admin',
            actor_id: adminId,
            action: `Update Fraud Report #${reportId} Status to ${status}`,
            target_type: 'fraud_reports',
            target_id: reportId,
            reason: resolution_summary || 'Dispute resolution',
            ip_address: request.ip
        });
        return reply.send({ success: true, message: 'Fraud report updated successfully.' });
    });
    /**
     * GET /api/admin/security/stats
     * JSON endpoint for real-time security telemetry
     */
    fastify.get('/api/admin/security/stats', async (request, reply) => {
        const adminId = requireSecurityAdmin(request, reply);
        if (!adminId)
            return;
        const metrics = getSecurityMetrics();
        return reply.send({ success: true, metrics });
    });
}
