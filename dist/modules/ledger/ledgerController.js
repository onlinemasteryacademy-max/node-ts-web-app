"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerRoutes = void 0;
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const ledgerRoutes = async (fastify) => {
    // 1. Sales Ledger API (7 days for Free, Lifetime for Pro/Business)
    fastify.get('/api/merchant/ledger', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const { config, isPro } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
        const query = (req.query || {});
        const db = (0, db_js_1.getDb)();
        let orders = [];
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 86400000);
        const dayOfWeek = now.getDay();
        const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const threeMonthsAgo = new Date(todayStart.getTime() - 90 * 86400000);
        const sixMonthsAgo = new Date(todayStart.getTime() - 180 * 86400000);
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const timeframe = String(query.timeframe || query.period || '').toLowerCase();
        const isProTimeframe = ['3months', '6months', 'yearly', 'lifetime'].includes(timeframe);
        // Free plan allows: today, yesterday, this_week, this_month, last_month
        let isRestricted = !isPro && (isProTimeframe || (query.start_date && new Date(query.start_date) < lastMonthStart));
        let sql = 'SELECT * FROM orders WHERE store_id = ?';
        const params = [currentStore.id];
        if (timeframe === 'today') {
            sql += ' AND created_at >= ?';
            params.push(todayStart.toISOString());
        }
        else if (timeframe === 'yesterday') {
            sql += ' AND created_at >= ? AND created_at < ?';
            params.push(yesterdayStart.toISOString(), todayStart.toISOString());
        }
        else if (timeframe === 'this_week' || timeframe === 'week') {
            sql += ' AND created_at >= ?';
            params.push(thisWeekStart.toISOString());
        }
        else if (timeframe === 'this_month' || timeframe === 'month') {
            sql += ' AND created_at >= ?';
            params.push(thisMonthStart.toISOString());
        }
        else if (timeframe === 'last_month') {
            sql += ' AND created_at >= ? AND created_at < ?';
            params.push(lastMonthStart.toISOString(), thisMonthStart.toISOString());
        }
        else if (timeframe === '3months' && isPro) {
            sql += ' AND created_at >= ?';
            params.push(threeMonthsAgo.toISOString());
        }
        else if (timeframe === '6months' && isPro) {
            sql += ' AND created_at >= ?';
            params.push(sixMonthsAgo.toISOString());
        }
        else if (timeframe === 'yearly' && isPro) {
            sql += ' AND created_at >= ?';
            params.push(yearStart.toISOString());
        }
        else if (timeframe === 'lifetime' && isPro) {
            // no date bound for lifetime
        }
        else if (query.start_date) {
            const minDate = isPro ? query.start_date : (new Date(query.start_date) < lastMonthStart ? lastMonthStart.toISOString().slice(0, 10) : query.start_date);
            sql += ' AND created_at >= ?';
            params.push(minDate + ' 00:00:00');
            if (query.end_date) {
                sql += ' AND created_at <= ?';
                params.push(query.end_date + ' 23:59:59');
            }
        }
        else if (!isPro) {
            // Default Free Plan Bound: includes up to start of last month
            sql += ' AND created_at >= ?';
            params.push(lastMonthStart.toISOString());
        }
        if (query.payment_status && query.payment_status !== 'all') {
            sql += ' AND payment_status = ?';
            params.push(query.payment_status);
        }
        sql += ' ORDER BY id DESC';
        const stmt = db.prepare(sql);
        orders = stmt.all(...params);
        // Ledger Summary Analytics
        const paidOrders = orders.filter(o => o.payment_status === 'paid');
        const totalSalesRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        const averageOrderValue = paidOrders.length > 0 ? (totalSalesRevenue / paidOrders.length) : 0;
        const pendingOrdersCount = orders.filter(o => o.payment_status !== 'paid').length;
        return reply.send({
            success: true,
            orders,
            summary: {
                total_orders: orders.length,
                paid_orders_count: paidOrders.length,
                pending_orders_count: pendingOrdersCount,
                total_revenue: totalSalesRevenue,
                total_revenue_formatted: (0, helpers_js_1.formatCurrency)(totalSalesRevenue),
                average_order_value: averageOrderValue,
                average_order_value_formatted: (0, helpers_js_1.formatCurrency)(averageOrderValue),
                is_restricted: isRestricted,
                timeframe: timeframe || 'all_free',
                allowed_free_timeframes: ['today', 'yesterday', 'this_week', 'this_month', 'last_month']
            },
            isPro
        });
    });
    // 2. CSV Export (Pro & Business Feature)
    fastify.get('/api/merchant/ledger/export', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const { isPro, config } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
        if (!isPro && !config.features.full_sales_ledger_export) {
            return reply.code(403).send({
                success: false,
                error: 'CSV Sales Ledger export is a Pro & Business feature. Please upgrade to export your sales history.'
            });
        }
        const query = (req.query || {});
        const db = (0, db_js_1.getDb)();
        let sql = 'SELECT * FROM orders WHERE store_id = ?';
        const params = [currentStore.id];
        if (query.start_date) {
            sql += ' AND created_at >= ?';
            params.push(query.start_date + ' 00:00:00');
        }
        if (query.end_date) {
            sql += ' AND created_at <= ?';
            params.push(query.end_date + ' 23:59:59');
        }
        sql += ' ORDER BY id DESC';
        const stmt = db.prepare(sql);
        const orders = stmt.all(...params);
        // Build CSV Content
        const csvHeaders = [
            'Order Ref',
            'Date & Time',
            'Customer Name',
            'Phone Number',
            'Fulfillment Type',
            'Items Count',
            'Subtotal (NGN)',
            'Delivery Fee (NGN)',
            'Total Amount (NGN)',
            'Payment Method',
            'Payment Status',
            'Order Status',
            'Payment Proof Ref'
        ];
        const escapeCsv = (str) => {
            if (str === null || str === undefined)
                return '""';
            const s = String(str).replace(/"/g, '""');
            return `"${s}"`;
        };
        const csvRows = orders.map(o => {
            let itemsCount = 0;
            try {
                const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json;
                itemsCount = Array.isArray(items) ? items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0) : 0;
            }
            catch (e) { }
            return [
                escapeCsv(o.order_ref),
                escapeCsv(o.created_at),
                escapeCsv(o.customer_name),
                escapeCsv(o.customer_phone),
                escapeCsv(o.fulfillment_type),
                itemsCount,
                Number(o.subtotal || 0).toFixed(2),
                Number(o.delivery_fee || 0).toFixed(2),
                Number(o.total_amount || 0).toFixed(2),
                escapeCsv(o.payment_method),
                escapeCsv(o.payment_status),
                escapeCsv(o.order_status),
                escapeCsv(o.payment_proof_ref || '')
            ].join(',');
        });
        const csvContent = [csvHeaders.join(','), ...csvRows].join('\r\n');
        const filename = `sales_ledger_${currentStore.slug}_${new Date().toISOString().slice(0, 10)}.csv`;
        return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csvContent);
    });
};
exports.ledgerRoutes = ledgerRoutes;
