"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PERMISSIONS = exports.PREDEFINED_ROLES = void 0;
exports.getAdminRoles = getAdminRoles;
exports.getAdminUser = getAdminUser;
exports.hasAdminPermission = hasAdminPermission;
exports.logAdminAction = logAdminAction;
const db_js_1 = require("../../db/db.js");
exports.PREDEFINED_ROLES = {
    super_admin: {
        id: 'super_admin',
        name: 'Super Admin (Owner)',
        description: 'Full unrestricted platform access (Pricing, Paystack API, Team management, Backups, Bans)',
        is_system: true,
        permissions: ['*']
    },
    support_lead: {
        id: 'support_lead',
        name: 'Operations & Support Lead',
        description: 'Merchant CRM, 1-Click Store Impersonation, Store suspension, KYC badges, Orders view',
        is_system: true,
        permissions: ['manage_merchants', 'impersonate_merchants', 'manage_verification', 'manage_security', 'manage_broadcasts', 'view_audit_logs']
    },
    moderator: {
        id: 'moderator',
        name: 'Trust & Safety Moderator',
        description: 'Global product catalog search, prohibited items flagging, seller verification reviews',
        is_system: true,
        permissions: ['manage_catalog', 'manage_verification', 'manage_security', 'view_audit_logs']
    },
    finance_analyst: {
        id: 'finance_analyst',
        name: 'Financial & Billing Analyst',
        description: 'View GMV, MRR, Paystack transaction logs, subscription ledger, revenue metrics',
        is_system: true,
        permissions: ['manage_pricing', 'view_audit_logs']
    }
};
exports.SYSTEM_PERMISSIONS = {
    manage_merchants: { label: 'Manage Merchants', desc: 'Edit merchant profiles, passwords, store status, and manual tier overrides' },
    impersonate_merchants: { label: '1-Click Merchant Impersonation', desc: 'Securely enter merchant dashboard to assist sellers in real-time' },
    manage_catalog: { label: 'Global Catalog Moderation', desc: 'Audit products platform-wide and toggle prohibited item status' },
    manage_pricing: { label: 'Pricing & Plan Engine', desc: 'Change subscription fees and tier product limits' },
    manage_integrations: { label: 'API & Gateway Keys', desc: 'Manage Paystack public/secret keys, webhooks, and SMTP dispatch settings' },
    manage_broadcasts: { label: 'Platform Announcements', desc: 'Broadcast global system announcements to active seller portals' },
    manage_team: { label: 'Admin Team & Roles', desc: 'Invite administrators and configure custom RBAC permissions' },
    manage_verification: { label: 'Merchant Verification Badges', desc: 'Approve or revoke verified checkmarks on merchant stores' },
    manage_security: { label: 'Trust & Safety / Fraud Prevention', desc: 'Review seller verifications, manage fraud reports, configure identity providers, and toggle order gating' },
    manage_system_ops: { label: 'System Maintenance & Backups', desc: 'Perform live database snapshots and purge caches' },
    view_audit_logs: { label: 'Platform Audit Trails', desc: 'Inspect administrative audit records and transactional mail logs' }
};
function getAdminRoles() {
    const roles = { ...exports.PREDEFINED_ROLES };
    try {
        const customRoles = (0, db_js_1.dbFetchAll)('admin_roles');
        for (const cr of customRoles) {
            let perms = [];
            try {
                perms = typeof cr.permissions_json === 'string' ? JSON.parse(cr.permissions_json) : (cr.permissions || []);
            }
            catch (e) { }
            roles[cr.id] = {
                id: cr.id,
                name: cr.name,
                description: cr.description || '',
                is_system: false,
                permissions: Array.isArray(perms) ? perms : []
            };
        }
    }
    catch (e) { }
    return roles;
}
function getAdminUser(adminId) {
    const id = Number(adminId);
    if (!id)
        return null;
    const admin = (0, db_js_1.dbFetchOne)('super_admins', { id });
    if (!admin)
        return null;
    const role = admin.role || 'super_admin';
    const roles = getAdminRoles();
    admin.role_info = roles[role] || roles.super_admin;
    admin.effective_permissions = admin.role_info?.permissions || [];
    return admin;
}
function hasAdminPermission(permissionKey, adminId) {
    const admin = getAdminUser(adminId);
    if (!admin)
        return false;
    const perms = admin.effective_permissions || [];
    return perms.includes('*') || perms.includes(permissionKey);
}
function logAdminAction(adminId, action, targetType = '', targetId = '', details = '', ip = '127.0.0.1') {
    const admin = getAdminUser(adminId);
    const adminName = admin ? `${admin.name} (${admin.email})` : `Admin #${adminId}`;
    return (0, db_js_1.dbInsert)('admin_audit_logs', {
        admin_id: Number(adminId) || 0,
        admin_name: adminName,
        action: String(action),
        target_type: String(targetType),
        target_id: Number(targetId) || null,
        details: typeof details === 'object' ? JSON.stringify(details) : String(details),
        ip_address: ip,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
}
