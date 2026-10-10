import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete, getDb } from '../../db/db.js';
import { getStorePlanDetails } from '../../utils/helpers.js';

export const teamsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. List Staff Accounts
  fastify.get('/api/merchant/staff', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config, isPro, isBusiness } = getStorePlanDetails(currentStore);

    const staffLimit = config.limits.staff_accounts;
    const staffList = dbFetchAll<any>('staff_accounts', { store_id: currentStore.id });

    return reply.send({
      success: true,
      staff: staffList.map(s => ({
        ...s,
        permissions: typeof s.permissions_json === 'string' ? JSON.parse(s.permissions_json) : (s.permissions_json || ['orders'])
      })),
      limits: {
        max_staff: staffLimit,
        current_staff: staffList.length,
        allowed: staffLimit > 0
      },
      plan: currentStore.plan_tier
    });
  });

  // 2. Add / Invite Staff Member
  fastify.post('/api/merchant/staff', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config, isPro, isBusiness } = getStorePlanDetails(currentStore);
    const staffLimit = config.limits.staff_accounts;

    if (staffLimit <= 0) {
      return reply.code(403).send({
        success: false,
        error: 'Staff accounts are available on Pro (1 staff) and Business (5 staff). Please upgrade to add team members.'
      });
    }

    const existingStaff = dbFetchAll<any>('staff_accounts', { store_id: currentStore.id, status: 'active' });
    if (existingStaff.length >= staffLimit) {
      return reply.code(403).send({
        success: false,
        error: `You have reached your plan limit of ${staffLimit} staff account(s). Upgrade to Business for up to 5 staff accounts.`
      });
    }

    const body = (req.body || {}) as any;
    const name = body.name?.trim();
    const phone = body.phone?.trim();
    const email = body.email?.trim() || null;
    const role = body.role?.trim() || 'sales_rep';
    const pin = body.pin_code?.trim() || '1234';
    const permissions = Array.isArray(body.permissions) ? body.permissions : ['orders', 'chat'];

    if (!name || !phone) {
      return reply.code(400).send({ success: false, error: 'Staff name and phone number are required.' });
    }

    const staffId = dbInsert('staff_accounts', {
      store_id: currentStore.id,
      name,
      phone,
      email,
      role,
      permissions_json: JSON.stringify(permissions),
      pin_code: pin,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const createdStaff = dbFetchOne<any>('staff_accounts', { id: staffId });
    return reply.send({ success: true, staff: createdStaff });
  });

  // 3. Update / Toggle Staff Member Status
  fastify.post('/api/merchant/staff/toggle', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });

    const body = (req.body || {}) as any;
    const staffId = parseInt(body.id || '0');
    const existing = dbFetchOne<any>('staff_accounts', { id: staffId, store_id: store.id });
    if (!existing) return reply.code(404).send({ success: false, error: 'Staff account not found' });

    const newStatus = existing.status === 'active' ? 'inactive' : 'active';
    dbUpdate('staff_accounts', { status: newStatus, updated_at: new Date().toISOString() }, { id: staffId });
    return reply.send({ success: true, status: newStatus });
  });

  // 4. Delete Staff Member
  fastify.post('/api/merchant/staff/delete', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized' });

    const body = (req.body || {}) as any;
    const staffId = parseInt(body.id || '0');
    dbDelete('staff_accounts', { id: staffId, store_id: store.id });
    return reply.send({ success: true });
  });
};
