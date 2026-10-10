"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchesRoutes = void 0;
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const branchesRoutes = async (fastify) => {
    // 1. List Store Branches
    fastify.get('/api/merchant/branches', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const branches = (0, db_js_1.dbFetchAll)('branches', { store_id: currentStore.id });
        return reply.send({
            success: true,
            branches
        });
    });
    // 2. Create Branch (Business Plan Feature)
    fastify.post('/api/merchant/branches', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const { isBusiness } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
        if (!isBusiness) {
            return reply.code(403).send({
                success: false,
                error: 'Multi-branch operations & inventory is a Business plan feature. Please upgrade to Business.'
            });
        }
        const body = (req.body || {});
        const name = body.name?.trim();
        const address = body.address?.trim() || null;
        const city = body.city?.trim() || null;
        const phone = body.phone?.trim() || null;
        const managerName = body.manager_name?.trim() || null;
        const isMain = body.is_main ? 1 : 0;
        if (!name) {
            return reply.code(400).send({ success: false, error: 'Branch name is required.' });
        }
        const branchId = (0, db_js_1.dbInsert)('branches', {
            store_id: currentStore.id,
            name,
            address,
            city,
            phone,
            manager_name: managerName,
            is_main: isMain,
            status: 'active',
            created_at: new Date().toISOString()
        });
        const branch = (0, db_js_1.dbFetchOne)('branches', { id: branchId });
        return reply.send({ success: true, branch });
    });
    // 3. Delete Branch
    fastify.post('/api/merchant/branches/delete', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const body = (req.body || {});
        const branchId = parseInt(body.id || '0');
        (0, db_js_1.dbDelete)('branches', { id: branchId, store_id: store.id });
        return reply.send({ success: true });
    });
    // 4. Multi-Branch Sales Breakdown Report
    fastify.get('/api/merchant/reports/by-branch', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const db = (0, db_js_1.getDb)();
        const branches = (0, db_js_1.dbFetchAll)('branches', { store_id: currentStore.id });
        const stmt = db.prepare(`
      SELECT 
        branch_id,
        COUNT(id) as total_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_revenue
      FROM orders
      WHERE store_id = ?
      GROUP BY branch_id
    `);
        const results = stmt.all(currentStore.id);
        const branchMap = {};
        results.forEach(r => { branchMap[String(r.branch_id || '0')] = r; });
        const breakdown = branches.map(b => {
            const data = branchMap[String(b.id)] || { total_orders: 0, total_revenue: 0 };
            return {
                branch_id: b.id,
                branch_name: b.name,
                city: b.city,
                total_orders: data.total_orders,
                total_revenue: Number(data.total_revenue) || 0,
                total_revenue_formatted: (0, helpers_js_1.formatCurrency)(Number(data.total_revenue) || 0)
            };
        });
        return reply.send({
            success: true,
            breakdown
        });
    });
    // 5. Staff Performance & Sales Breakdown Report
    fastify.get('/api/merchant/reports/by-staff', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const db = (0, db_js_1.getDb)();
        const staffList = (0, db_js_1.dbFetchAll)('staff_accounts', { store_id: currentStore.id });
        const stmt = db.prepare(`
      SELECT 
        staff_id,
        COUNT(id) as total_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_revenue
      FROM orders
      WHERE store_id = ? AND staff_id IS NOT NULL
      GROUP BY staff_id
    `);
        const results = stmt.all(currentStore.id);
        const staffMap = {};
        results.forEach(r => { staffMap[String(r.staff_id)] = r; });
        const breakdown = staffList.map(s => {
            const data = staffMap[String(s.id)] || { total_orders: 0, total_revenue: 0 };
            return {
                staff_id: s.id,
                staff_name: s.name,
                role: s.role,
                total_orders: data.total_orders,
                total_revenue: Number(data.total_revenue) || 0,
                total_revenue_formatted: (0, helpers_js_1.formatCurrency)(Number(data.total_revenue) || 0)
            };
        });
        return reply.send({
            success: true,
            breakdown
        });
    });
};
exports.branchesRoutes = branchesRoutes;
