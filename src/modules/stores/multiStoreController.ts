import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate, getDb } from '../../db/db.js';
import { getStorePlanDetails } from '../../utils/helpers.js';

export const multiStoreRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. List All Stores Owned By Current Merchant
  fastify.get('/api/merchant/my-stores', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config, isPro, isBusiness } = getStorePlanDetails(currentStore);
    const maxStores = config.limits.max_stores;

    const db = getDb();
    const ownerId = currentStore.owner_id || currentStore.id;

    const stmt = db.prepare(`
      SELECT * FROM stores 
      WHERE id = ? OR owner_id = ? OR (email = ? AND email IS NOT NULL AND TRIM(email) != '')
      ORDER BY id ASC
    `);
    const myStores = stmt.all(ownerId, ownerId, currentStore.email || '') as any[];

    return reply.send({
      success: true,
      current_store_id: currentStore.id,
      stores: myStores.map(s => ({
        id: s.id,
        name: s.store_name,
        slug: s.slug,
        plan: s.plan_tier,
        logo_url: s.logo_url,
        template_slug: s.template_slug || 'general_clean',
        is_current: s.id === currentStore.id
      })),
      limits: {
        max_stores: maxStores,
        current_stores: myStores.length,
        can_add_more: myStores.length < maxStores
      }
    });
  });

  // 2. Switch Active Session Store
  fastify.post('/api/merchant/switch-store', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const body = (req.body || {}) as any;
    const targetStoreId = parseInt(body.store_id || '0');

    const db = getDb();
    const ownerId = currentStore.owner_id || currentStore.id;

    // Verify ownership of the target store
    const targetStore = db.prepare(`
      SELECT * FROM stores 
      WHERE id = ? AND (id = ? OR owner_id = ? OR (email = ? AND email IS NOT NULL AND TRIM(email) != ''))
    `).get(targetStoreId, ownerId, ownerId, currentStore.email || '') as any;

    if (!targetStore) {
      return reply.code(403).send({ success: false, error: 'You do not have access to switch to this store.' });
    }

    (req as any).session.merchantStore = targetStore;
    return reply.send({ success: true, store: targetStore });
  });

  // 3. Create Additional Store under same Merchant (Pro: up to 3, Business: up to 10)
  fastify.post('/api/merchant/create-store', async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const { config, isPro, isBusiness } = getStorePlanDetails(currentStore);
    const maxStores = config.limits.max_stores;

    const db = getDb();
    const ownerId = currentStore.owner_id || currentStore.id;

    const myStores = db.prepare(`
      SELECT id FROM stores 
      WHERE id = ? OR owner_id = ? OR (email = ? AND email IS NOT NULL AND TRIM(email) != '')
    `).all(ownerId, ownerId, currentStore.email || '') as any[];

    if (myStores.length >= maxStores) {
      return reply.code(403).send({
        success: false,
        error: `Your plan limit of ${maxStores} store(s) has been reached. Please upgrade to Pro (up to 3 stores) or Business (up to 10 stores).`
      });
    }

    const body = (req.body || {}) as any;
    const storeName = body.name?.trim();
    let slug = body.slug ? body.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
    const whatsapp = body.whatsapp?.trim() || currentStore.whatsapp_number;
    const templateSlug = body.template_slug || 'general_clean';

    if (!storeName) {
      return reply.code(400).send({ success: false, error: 'Store name is required.' });
    }

    if (!slug) {
      slug = storeName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);
    }

    // Check slug uniqueness
    const existingSlug = dbFetchOne<any>('stores', { slug });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const newStoreId = dbInsert('stores', {
      store_name: storeName,
      slug,
      whatsapp_number: whatsapp,
      email: currentStore.email,
      owner_id: ownerId,
      plan_tier: currentStore.plan_tier,
      template_slug: templateSlug,
      currency_symbol: currentStore.currency_symbol || '₦',
      primary_color: currentStore.primary_color || '#08110D',
      status: 'active'
    });

    const createdStore = dbFetchOne<any>('stores', { id: newStoreId });
    return reply.send({ success: true, store: createdStore });
  });
};
