import { dbFetchOne, dbInsert, getDb } from '../../db/db.js';
/**
 * Record a store visit event in SQLite
 */
export function recordStoreVisit(storeId, ipAddress, userAgent, properties) {
    if (!storeId)
        return;
    try {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        dbInsert('analytics_events', {
            store_id: storeId,
            event_name: 'store_visit',
            properties_json: properties ? JSON.stringify(properties) : null,
            ip_address: ipAddress || '127.0.0.1',
            user_agent: userAgent || null,
            created_at: now
        });
    }
    catch (e) {
        // Non-blocking for analytics logging
    }
}
/**
 * Calculate comprehensive store visitor metrics for all timeframes
 * (Today, Yesterday, 7 Days, 1 Month, Quarterly, Yearly, Lifetime)
 */
export function getStoreVisitorMetrics(storeId) {
    const db = getDb();
    const now = new Date();
    // Start of today: 00:00:00.000
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStartIso = startOfToday.toISOString().slice(0, 19).replace('T', ' ');
    // Start of yesterday: 00:00:00.000 and End of yesterday: 23:59:59.999
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStartIso = startOfYesterday.toISOString().slice(0, 19).replace('T', ' ');
    const yesterdayEndIso = new Date(startOfToday.getTime() - 1).toISOString().slice(0, 19).replace('T', ' ');
    // 7 Days ago
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const sevenDaysStartIso = sevenDaysAgo.toISOString().slice(0, 19).replace('T', ' ');
    // 1 Month (30 Days) ago
    const oneMonthAgo = new Date(now.getTime() - 30 * 86400000);
    const oneMonthStartIso = oneMonthAgo.toISOString().slice(0, 19).replace('T', ' ');
    // Quarterly (90 Days) ago
    const quarterlyAgo = new Date(now.getTime() - 90 * 86400000);
    const quarterlyStartIso = quarterlyAgo.toISOString().slice(0, 19).replace('T', ' ');
    // Yearly (365 Days) ago
    const yearlyAgo = new Date(now.getTime() - 365 * 86400000);
    const yearlyStartIso = yearlyAgo.toISOString().slice(0, 19).replace('T', ' ');
    // Fetch all visit events for this store
    const rows = db.prepare(`
    SELECT ip_address, created_at 
    FROM analytics_events 
    WHERE store_id = ? AND event_name = 'store_visit'
  `).all(storeId);
    const todayIps = new Set();
    const yesterdayIps = new Set();
    const sevenDaysIps = new Set();
    const monthIps = new Set();
    const quarterlyIps = new Set();
    const yearlyIps = new Set();
    const lifetimeIps = new Set();
    let todayVisits = 0;
    let yesterdayVisits = 0;
    let sevenDaysVisits = 0;
    let monthVisits = 0;
    let quarterlyVisits = 0;
    let yearlyVisits = 0;
    let lifetimeVisits = rows.length;
    for (const row of rows) {
        const rawDate = row.created_at || '';
        const ip = row.ip_address || 'unknown';
        lifetimeIps.add(ip);
        if (rawDate >= todayStartIso) {
            todayVisits++;
            todayIps.add(ip);
        }
        if (rawDate >= yesterdayStartIso && rawDate <= yesterdayEndIso) {
            yesterdayVisits++;
            yesterdayIps.add(ip);
        }
        if (rawDate >= sevenDaysStartIso) {
            sevenDaysVisits++;
            sevenDaysIps.add(ip);
        }
        if (rawDate >= oneMonthStartIso) {
            monthVisits++;
            monthIps.add(ip);
        }
        if (rawDate >= quarterlyStartIso) {
            quarterlyVisits++;
            quarterlyIps.add(ip);
        }
        if (rawDate >= yearlyStartIso) {
            yearlyVisits++;
            yearlyIps.add(ip);
        }
    }
    return {
        today: {
            label: 'Today',
            visits: todayVisits,
            unique_visitors: todayIps.size
        },
        yesterday: {
            label: 'Yesterday',
            visits: yesterdayVisits,
            unique_visitors: yesterdayIps.size
        },
        '7days': {
            label: 'Last 7 Days',
            visits: sevenDaysVisits,
            unique_visitors: sevenDaysIps.size
        },
        month: {
            label: 'Last 30 Days (1 Month)',
            visits: monthVisits,
            unique_visitors: monthIps.size
        },
        quarterly: {
            label: 'Last 90 Days (Quarterly)',
            visits: quarterlyVisits,
            unique_visitors: quarterlyIps.size
        },
        yearly: {
            label: 'Last 365 Days (Yearly)',
            visits: yearlyVisits,
            unique_visitors: yearlyIps.size
        },
        lifetime: {
            label: 'Full Lifetime',
            visits: lifetimeVisits,
            unique_visitors: lifetimeIps.size
        }
    };
}
export const analyticsRoutes = async (fastify) => {
    // 1. Get Store Visitor Analytics (Merchant Console)
    fastify.get('/api/merchant/analytics/visitors', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = dbFetchOne('stores', { id: store.id }) || store;
        const metrics = getStoreVisitorMetrics(currentStore.id);
        return reply.send({
            success: true,
            store_id: currentStore.id,
            metrics
        });
    });
    // 2. Track Custom Analytics Event (Public / Storefront)
    fastify.post('/api/analytics/track', async (req, reply) => {
        const body = (req.body || {});
        const storeId = parseInt(body.store_id || '0');
        const eventName = body.event_name || 'store_visit';
        if (!storeId) {
            return reply.code(400).send({ success: false, error: 'Store ID required' });
        }
        recordStoreVisit(storeId, req.ip, req.headers['user-agent'], body.properties);
        return reply.send({ success: true });
    });
};
