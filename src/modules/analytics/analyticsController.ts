import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, getDb } from '../../db/db.js';
import { getStorePlanDetails } from '../../utils/helpers.js';

export interface VisitorPeriodStat {
  label: string;
  visits: number;
  unique_visitors: number;
}

export interface StoreVisitorMetrics {
  today: VisitorPeriodStat;
  yesterday: VisitorPeriodStat;
  '7days': VisitorPeriodStat;
  month: VisitorPeriodStat;
  quarterly: VisitorPeriodStat;
  yearly: VisitorPeriodStat;
  lifetime: VisitorPeriodStat;
}

/**
 * Record a store visit event in SQLite
 */
export function recordStoreVisit(
  storeId: number,
  ipAddress?: string,
  userAgent?: string,
  properties?: Record<string, any>
): void {
  if (!storeId) return;
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
  } catch (e) {
    // Non-blocking for analytics logging
  }
}

/**
 * Calculate comprehensive store visitor metrics for all timeframes
 * (Today, Yesterday, 7 Days, 1 Month, Quarterly, Yearly, Lifetime)
 */
export function getStoreVisitorMetrics(storeId: number): StoreVisitorMetrics {
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
  `).all(storeId) as Array<{ ip_address: string; created_at: string }>;

  const todayIps = new Set<string>();
  const yesterdayIps = new Set<string>();
  const sevenDaysIps = new Set<string>();
  const monthIps = new Set<string>();
  const quarterlyIps = new Set<string>();
  const yearlyIps = new Set<string>();
  const lifetimeIps = new Set<string>();

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

export interface VisitorHeartbeatPayload {
  store_id: number;
  visitor_session_id: string;
  branch_id?: number | null;
  current_page?: string;
  page_title?: string;
  traffic_source?: string;
  customer_name?: string;
}

export interface LiveVisitorItem {
  id: number;
  session_id: string;
  display_name: string;
  current_page: string;
  page_title: string | null;
  traffic_source: string;
  branch_id: number | null;
  first_seen_at: string;
  last_seen_at: string;
  active_seconds_ago: number;
  minutes_on_site: number;
}

/**
 * Record or refresh an active visitor session via periodic heartbeat or page beacon
 */
export function recordVisitorHeartbeat(payload: VisitorHeartbeatPayload): { success: boolean } {
  if (!payload.store_id || !payload.visitor_session_id) {
    return { success: false };
  }
  const db = getDb();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const storeId = Number(payload.store_id);
  const sessionToken = String(payload.visitor_session_id).trim();
  const branchId = payload.branch_id ? Number(payload.branch_id) : null;
  const currentPage = (payload.current_page || 'Storefront').slice(0, 255);
  const pageTitle = payload.page_title ? String(payload.page_title).slice(0, 255) : null;
  const trafficSource = (payload.traffic_source || 'Direct').slice(0, 100);
  const custName = payload.customer_name ? String(payload.customer_name).slice(0, 150) : null;

  try {
    const existing = db.prepare(`
      SELECT id, first_seen_at FROM active_visitors 
      WHERE store_id = ? AND visitor_session_id = ?
    `).get(storeId, sessionToken) as any;

    if (existing) {
      db.prepare(`
        UPDATE active_visitors 
        SET last_seen_at = ?, current_page = ?, page_title = COALESCE(?, page_title),
            branch_id = COALESCE(?, branch_id), customer_name = COALESCE(?, customer_name)
        WHERE id = ?
      `).run(now, currentPage, pageTitle, branchId, custName, existing.id);
    } else {
      db.prepare(`
        INSERT INTO active_visitors 
        (store_id, branch_id, visitor_session_id, customer_name, traffic_source, current_page, page_title, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(storeId, branchId, sessionToken, custName, trafficSource, currentPage, pageTitle, now, now);
    }
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

/**
 * Cleanup expired visitor sessions older than maxAgeSeconds (default 3 minutes)
 */
export function cleanupInactiveVisitors(maxAgeSeconds: number = 180): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
  try {
    const res = db.prepare(`DELETE FROM active_visitors WHERE last_seen_at < ?`).run(cutoff);
    return Number(res.changes);
  } catch (e) {
    return 0;
  }
}

/**
 * Fetch genuine active visitors for Pro and Business merchants
 */
export function getLiveStoreVisitors(storeId: number, options: { branchId?: number; isBusiness?: boolean } = {}) {
  const db = getDb();
  const nowMs = Date.now();
  // Active window: within last 180 seconds (3 minutes)
  const cutoff = new Date(nowMs - 180 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  let sql = `
    SELECT id, store_id, branch_id, visitor_session_id, customer_name, traffic_source, current_page, page_title, first_seen_at, last_seen_at
    FROM active_visitors
    WHERE store_id = ? AND last_seen_at >= ?
  `;
  const params: any[] = [storeId, cutoff];

  if (options.branchId) {
    sql += ` AND branch_id = ?`;
    params.push(options.branchId);
  }

  sql += ` ORDER BY last_seen_at DESC LIMIT 50`;

  const rows = db.prepare(sql).all(...params) as any[];

  const visitors: LiveVisitorItem[] = rows.map((r, idx) => {
    // SQLite timestamps: 'YYYY-MM-DD HH:MM:SS'
    const lastSeenIso = r.last_seen_at ? r.last_seen_at.replace(' ', 'T') + 'Z' : '';
    const firstSeenIso = r.first_seen_at ? r.first_seen_at.replace(' ', 'T') + 'Z' : '';
    const lastSeenMs = lastSeenIso ? new Date(lastSeenIso).getTime() : nowMs;
    const firstSeenMs = firstSeenIso ? new Date(firstSeenIso).getTime() : lastSeenMs;
    const diffSec = Math.max(0, Math.round((nowMs - lastSeenMs) / 1000));
    const siteMins = Math.max(1, Math.round((nowMs - firstSeenMs) / 60000));

    // Anonymous display identifier if name unknown
    const hash = (r.visitor_session_id || '').slice(-4).toUpperCase();
    const displayName = r.customer_name || `Shopper #${hash || (1000 + idx)}`;

    return {
      id: r.id,
      session_id: r.visitor_session_id,
      display_name: displayName,
      current_page: r.current_page || 'Storefront',
      page_title: r.page_title || null,
      traffic_source: r.traffic_source || 'Direct',
      branch_id: r.branch_id || null,
      first_seen_at: r.first_seen_at,
      last_seen_at: r.last_seen_at,
      active_seconds_ago: diffSec,
      minutes_on_site: siteMins
    };
  });

  // Calculate branch breakdown for Business tier
  const branchesBreakdown: Record<string, number> = {};
  if (options.isBusiness) {
    try {
      const branchRows = db.prepare(`
        SELECT branch_id, COUNT(*) as count 
        FROM active_visitors 
        WHERE store_id = ? AND last_seen_at >= ?
        GROUP BY branch_id
      `).all(storeId, cutoff) as Array<{ branch_id: number | null; count: number }>;

      for (const b of branchRows) {
        const key = b.branch_id ? `branch_${b.branch_id}` : 'main_branch';
        branchesBreakdown[key] = b.count;
      }
    } catch (e) {}
  }

  return {
    active_count: visitors.length,
    visitors,
    branches_breakdown: branchesBreakdown
  };
}

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Get Store Visitor Analytics (Merchant Console)
  fastify.get('/api/merchant/analytics/visitors', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const metrics = getStoreVisitorMetrics(currentStore.id);

    return reply.send({
      success: true,
      store_id: currentStore.id,
      metrics
    });
  });

  // 2. Track Custom Analytics Event (Public / Storefront)
  fastify.post('/api/analytics/track', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const storeId = parseInt(body.store_id || '0');
    const eventName = body.event_name || 'store_visit';

    if (!storeId) {
      return reply.code(400).send({ success: false, error: 'Store ID required' });
    }

    recordStoreVisit(storeId, req.ip, req.headers['user-agent'] as string, body.properties);
    return reply.send({ success: true });
  });

  // 3. Heartbeat Beacon (Storefront Shopper Live Tracking)
  fastify.post('/api/analytics/heartbeat', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const storeId = parseInt(body.store_id || '0');
    const sessionId = (body.visitor_session_id || '').trim();

    if (!storeId || !sessionId) {
      return reply.code(400).send({ success: false, error: 'store_id and visitor_session_id are required' });
    }

    recordVisitorHeartbeat({
      store_id: storeId,
      visitor_session_id: sessionId,
      branch_id: body.branch_id ? parseInt(body.branch_id) : null,
      current_page: body.current_page,
      page_title: body.page_title,
      traffic_source: body.traffic_source,
      customer_name: body.customer_name
    });

    return reply.send({ success: true });
  });

  // 4. Live Customer Tracking (Merchant Console - Pro & Business Only)
  fastify.get('/api/merchant/analytics/live-visitors', async (req: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const planDetails = getStorePlanDetails(currentStore);

    // Free users retain standard store analytics but cannot access live visitor tracking
    if (!planDetails.isPro && !planDetails.isBusiness) {
      return reply.code(403).send({
        success: false,
        locked: true,
        error: 'Live customer tracking is available on Pro and Business plans',
        tier: planDetails.tier
      });
    }

    const branchId = (req.query as any)?.branch_id ? parseInt((req.query as any).branch_id) : undefined;
    const liveData = getLiveStoreVisitors(currentStore.id, {
      branchId,
      isBusiness: planDetails.isBusiness
    });

    return reply.send({
      success: true,
      tier: planDetails.tier,
      is_business: planDetails.isBusiness,
      active_count: liveData.active_count,
      visitors: liveData.visitors,
      branches_breakdown: liveData.branches_breakdown
    });
  });
};
