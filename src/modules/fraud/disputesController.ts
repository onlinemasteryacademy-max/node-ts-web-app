import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { ENV } from '../../config/env.js';
import { getAdminUser, hasAdminPermission, logAdminAction } from '../admin/adminHelpers.js';
import { logSecurityAudit, getOrCreateSellerProfile, recordRiskEvent } from '../security/securityService.js';
import { evaluateSellerRisk } from './riskEngine.js';

export async function disputesRoutes(fastify: FastifyInstance) {
  const secretAdminPrefix = '/' + ENV.ADMIN_SECRET_PATH;

  /**
   * Helper: Require Super Admin Authentication
   */
  const requireSecurityAdmin = (request: FastifyRequest, reply: FastifyReply): number | null => {
    const adminId = (request.session as any)?.admin_id;
    if (!adminId) {
      if (request.url.startsWith('/api/')) {
        reply.code(401).send({ success: false, error: 'Unauthorized: Admin authentication required' });
      } else {
        reply.redirect(`${secretAdminPrefix}/login`);
      }
      return null;
    }
    if (!hasAdminPermission(adminId, 'manage_security')) {
      reply.code(403).send({ success: false, error: 'Forbidden: Security management permission required' });
      return null;
    }
    return adminId;
  };

  /**
   * 1. Public Customer Dispute Submission API
   * POST /api/disputes/submit
   */
  fastify.post('/api/disputes/submit', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body as any) || {};
    const reporterName = String(body.reporter_name || '').trim();
    const reporterEmail = String(body.reporter_email || '').trim().toLowerCase();
    const reporterPhone = body.reporter_phone ? String(body.reporter_phone).trim() : null;
    const storeSlugOrId = body.store_id || body.store_slug;
    const orderRef = body.order_ref ? String(body.order_ref).trim() : null;
    const category = String(body.category || 'other').trim();
    const description = String(body.description || '').trim();
    const evidenceUrls = body.evidence_urls || [];

    if (!reporterName || !reporterEmail || !storeSlugOrId || !description) {
      return reply.code(400).send({
        success: false,
        error: 'Reporter name, email, store reference, and dispute description are required.'
      });
    }

    // Look up target store
    let store: any = null;
    if (typeof storeSlugOrId === 'number' || /^\d+$/.test(String(storeSlugOrId))) {
      store = dbFetchOne<any>('stores', { id: Number(storeSlugOrId) });
    }
    if (!store) {
      store = dbFetchOne<any>('stores', { slug: String(storeSlugOrId) });
    }

    if (!store) {
      return reply.code(404).send({ success: false, error: 'Reported store could not be found.' });
    }

    // Look up order if order_ref provided
    let orderId: number | null = null;
    if (orderRef) {
      const order = dbFetchOne<any>('orders', { order_ref: orderRef, store_id: store.id });
      if (order) orderId = order.id;
    }

    // Generate unique human-readable case reference
    const caseRef = `FR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const severity = category === 'payment_diversion' ? 'critical' : (category === 'non_delivery' ? 'high' : 'medium');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const reportId = dbInsert('fraud_reports', {
      case_reference: caseRef,
      reporter_name: reporterName,
      reporter_email: reporterEmail,
      reporter_phone: reporterPhone,
      reported_store_id: store.id,
      order_id: orderId,
      category,
      severity,
      status: 'new',
      description,
      evidence_urls_json: Array.isArray(evidenceUrls) ? JSON.stringify(evidenceUrls) : JSON.stringify([evidenceUrls]),
      created_at: now,
      updated_at: now
    });

    // Record initial case event timeline
    dbInsert('fraud_case_events', {
      case_id: reportId,
      actor_type: 'customer',
      actor_id: null,
      event_type: 'CASE_OPENED',
      message: `Customer ${reporterName} filed a dispute under category "${category}".`,
      created_at: now
    });

    // Adjust seller risk score
    const seller = getOrCreateSellerProfile(store.id);
    recordRiskEvent({
      seller_id: seller.id,
      event_type: 'CUSTOMER_DISPUTE_FILED',
      score_delta: 20,
      reason_code: 'CUSTOMER_DISPUTE_SPIKE',
      metadata: { case_reference: caseRef, category, order_ref: orderRef }
    });

    // Re-evaluate seller composite risk
    evaluateSellerRisk(seller.id);

    logSecurityAudit({
      actor_type: 'merchant',
      action: 'Customer Fraud Dispute Opened',
      target_type: 'fraud_reports',
      target_id: reportId,
      reason: `Case ${caseRef} opened against ${store.store_name} (${store.slug}) by ${reporterName}`
    });

    return reply.send({
      success: true,
      case_reference: caseRef,
      report_id: reportId,
      message: `Dispute report successfully registered. Your reference number is ${caseRef}.`
    });
  });

  /**
   * 2. Public Dispute Status & Timeline Tracking
   * GET /api/disputes/:case_reference
   */
  fastify.get('/api/disputes/:case_reference', async (req: FastifyRequest<{ Params: { case_reference: string } }>, reply: FastifyReply) => {
    const caseRef = req.params.case_reference?.trim();
    if (!caseRef) {
      return reply.code(400).send({ success: false, error: 'Case reference is required.' });
    }

    const report = dbFetchOne<any>('fraud_reports', { case_reference: caseRef });
    if (!report) {
      return reply.code(404).send({ success: false, error: 'Dispute case not found.' });
    }

    const store = dbFetchOne<any>('stores', { id: report.reported_store_id });
    const timeline = dbFetchAll<any>('fraud_case_events', { case_id: report.id }, 'id ASC');

    let evidence: string[] = [];
    try {
      if (report.evidence_urls_json) evidence = JSON.parse(report.evidence_urls_json);
    } catch (e) {}

    return reply.send({
      success: true,
      case: {
        case_reference: report.case_reference,
        category: report.category,
        severity: report.severity,
        status: report.status,
        description: report.description,
        store_name: store?.store_name || 'Storefront',
        store_slug: store?.slug || '',
        resolution_code: report.resolution_code,
        resolution_summary: report.resolution_summary,
        evidence_urls: evidence,
        created_at: report.created_at,
        updated_at: report.updated_at
      },
      timeline
    });
  });

  /**
   * 3. Super Admin Dispute Management Console View
   * GET /${ENV.ADMIN_SECRET_PATH}/security/disputes
   */
  fastify.get(`${secretAdminPrefix}/security/disputes`, async (req: FastifyRequest, reply: FastifyReply) => {
    const adminId = requireSecurityAdmin(req, reply);
    if (!adminId) return;

    const currentAdmin = getAdminUser(adminId);
    const query = (req.query as any) || {};
    const filterStatus = query.status ? String(query.status) : 'all';
    const filterCategory = query.category ? String(query.category) : 'all';

    const allReports = dbFetchAll<any>('fraud_reports', {}, 'id DESC');

    const filtered = allReports.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      return true;
    });

    // Enrich with store and order details
    const storesMap = new Map<number, any>();
    const enriched = filtered.map(r => {
      if (!storesMap.has(r.reported_store_id)) {
        const store = dbFetchOne<any>('stores', { id: r.reported_store_id });
        if (store) storesMap.set(r.reported_store_id, store);
      }
      return {
        ...r,
        store: storesMap.get(r.reported_store_id) || null
      };
    });

    const counts = {
      all: allReports.length,
      new: allReports.filter(r => r.status === 'new').length,
      investigating: allReports.filter(r => r.status === 'investigating').length,
      resolved: allReports.filter(r => r.status === 'resolved').length,
      dismissed: allReports.filter(r => r.status === 'dismissed').length
    };

    return reply.view('admin/security/disputes.ejs', {
      title: 'Dispute & Fraud Case Management - Zlik Trust Console',
      adminPath: ENV.ADMIN_SECRET_PATH,
      currentAdmin,
      reports: enriched,
      counts,
      currentFilter: {
        status: filterStatus,
        category: filterCategory
      }
    });
  });

  /**
   * 4. Super Admin Action on Dispute Case
   * POST /api/admin/security/disputes/:id/action
   */
  fastify.post('/api/admin/security/disputes/:id/action', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const adminId = requireSecurityAdmin(req, reply);
    if (!adminId) return;

    const currentAdmin = getAdminUser(adminId);
    const reportId = Number(req.params.id);
    const report = dbFetchOne<any>('fraud_reports', { id: reportId });

    if (!report) {
      return reply.code(404).send({ success: false, error: 'Dispute report not found.' });
    }

    const body = (req.body as any) || {};
    const action = String(body.action || '').trim();
    const resolutionCode = body.resolution_code ? String(body.resolution_code).trim() : null;
    const summary = String(body.summary || body.notes || '').trim();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    switch (action) {
      case 'start_investigation': {
        dbUpdate('fraud_reports', {
          status: 'investigating',
          assigned_admin_id: adminId,
          updated_at: now
        }, { id: report.id });

        dbInsert('fraud_case_events', {
          case_id: report.id,
          actor_type: 'super_admin',
          actor_id: adminId,
          event_type: 'INVESTIGATION_BEGUN',
          message: `Investigation opened by ${currentAdmin?.name || 'Super Admin'}: ${summary || 'Reviewing evidence.'}`,
          created_at: now
        });

        logAdminAction(adminId, 'Started dispute investigation', 'fraud_reports', report.id, summary, req.ip);
        return reply.send({ success: true, message: 'Investigation marked as started.' });
      }

      case 'resolve': {
        dbUpdate('fraud_reports', {
          status: 'resolved',
          resolution_code: resolutionCode || 'resolved_refunded',
          resolution_summary: summary || 'Case resolved by administrator',
          assigned_admin_id: adminId,
          updated_at: now
        }, { id: report.id });

        dbInsert('fraud_case_events', {
          case_id: report.id,
          actor_type: 'super_admin',
          actor_id: adminId,
          event_type: 'CASE_RESOLVED',
          message: `Dispute resolved (${resolutionCode}): ${summary}`,
          created_at: now
        });

        // If cleared in seller's favor, adjust risk score downwards
        if (resolutionCode === 'resolved_merchant_cleared') {
          const seller = getOrCreateSellerProfile(report.reported_store_id);
          recordRiskEvent({
            seller_id: seller.id,
            event_type: 'DISPUTE_CLEARED',
            score_delta: -15,
            reason_code: 'DISPUTE_CLEARED',
            metadata: { case_id: report.id }
          });
        }

        logAdminAction(adminId, 'Resolved dispute case', 'fraud_reports', report.id, summary, req.ip);
        return reply.send({ success: true, message: 'Dispute case successfully resolved.' });
      }

      case 'dismiss': {
        dbUpdate('fraud_reports', {
          status: 'dismissed',
          resolution_code: 'dismissed_unsubstantiated',
          resolution_summary: summary || 'Dispute dismissed as unsubstantiated',
          assigned_admin_id: adminId,
          updated_at: now
        }, { id: report.id });

        dbInsert('fraud_case_events', {
          case_id: report.id,
          actor_type: 'super_admin',
          actor_id: adminId,
          event_type: 'CASE_DISMISSED',
          message: `Dispute dismissed by admin: ${summary}`,
          created_at: now
        });

        logAdminAction(adminId, 'Dismissed dispute case', 'fraud_reports', report.id, summary, req.ip);
        return reply.send({ success: true, message: 'Dispute dismissed.' });
      }

      case 'suspend_seller': {
        dbUpdate('fraud_reports', {
          status: 'resolved',
          resolution_code: 'seller_suspended',
          resolution_summary: summary || 'Seller suspended due to confirmed fraudulent activity',
          assigned_admin_id: adminId,
          updated_at: now
        }, { id: report.id });

        dbInsert('fraud_case_events', {
          case_id: report.id,
          actor_type: 'super_admin',
          actor_id: adminId,
          event_type: 'SELLER_SUSPENDED',
          message: `Storefront suspended due to fraud: ${summary}`,
          created_at: now
        });

        // Suspend the underlying storefront and update seller risk score to critical
        dbUpdate('stores', { status: 'suspended' }, { id: report.reported_store_id });
        const seller = getOrCreateSellerProfile(report.reported_store_id);
        dbUpdate('seller_profiles', {
          composite_verification_status: 'suspended',
          order_gating_enabled: 1
        }, { id: seller.id });

        recordRiskEvent({
          seller_id: seller.id,
          event_type: 'FRAUD_SUSPENSION',
          score_delta: 50,
          reason_code: 'CONFIRMED_FRAUD_DISPUTE',
          metadata: { case_id: report.id, summary }
        });

        logAdminAction(adminId, 'Suspended storefront from dispute', 'stores', report.reported_store_id, summary, req.ip);
        return reply.send({ success: true, message: 'Storefront suspended and dispute resolved.' });
      }

      default:
        return reply.code(400).send({ success: false, error: `Unknown dispute action '${action}'.` });
    }
  });
}
