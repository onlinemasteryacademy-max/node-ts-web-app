import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate, dbDelete, getDb } from '../../db/db.js';
import { getStorePlanDetails, formatCurrency } from '../../utils/helpers.js';

export const marketingRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Create Coupon (Merchant)
  fastify.post('/api/merchant/coupons', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const body = (req.body || {}) as any;
    const code = (body.code || '').trim().toUpperCase();
    const discountType = body.discount_type === 'fixed' ? 'fixed' : 'percentage';
    const discountValue = parseFloat(body.discount_value || 0);
    const minOrderAmount = parseFloat(body.min_order_amount || 0);
    const maxUses = parseInt(body.max_uses || -1, 10);
    const expiresAt = body.expires_at ? body.expires_at : null;

    if (!code) {
      return reply.code(400).send({ success: false, error: 'Coupon code is required' });
    }
    if (discountValue <= 0) {
      return reply.code(400).send({ success: false, error: 'Discount value must be greater than 0' });
    }
    if (discountType === 'percentage' && discountValue > 100) {
      return reply.code(400).send({ success: false, error: 'Percentage discount cannot exceed 100%' });
    }

    // Check duplicate code for this store
    const existing = dbFetchOne<any>('coupons', { store_id: store.id, code });
    if (existing) {
      return reply.code(400).send({ success: false, error: `Coupon code "${code}" already exists for your store` });
    }

    const couponId = dbInsert('coupons', {
      store_id: store.id,
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: minOrderAmount,
      max_uses: maxUses,
      uses_count: 0,
      expires_at: expiresAt,
      status: 'active'
    });

    const coupon = dbFetchOne<any>('coupons', { id: couponId });
    return reply.send({ success: true, coupon });
  });

  // 2. List Coupons (Merchant)
  fastify.get('/api/merchant/coupons', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const coupons = dbFetchAll<any>('coupons', { store_id: store.id }, 'id DESC');
    return reply.send({ success: true, coupons });
  });

  // 3. Toggle Coupon Status (Merchant)
  fastify.post('/api/merchant/coupons/toggle', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const body = (req.body || {}) as any;
    const couponId = parseInt(body.id, 10);
    const coupon = dbFetchOne<any>('coupons', { id: couponId, store_id: store.id });
    if (!coupon) return reply.code(404).send({ success: false, error: 'Coupon not found' });

    const newStatus = coupon.status === 'active' ? 'inactive' : 'active';
    dbUpdate('coupons', { status: newStatus }, { id: couponId });

    return reply.send({ success: true, status: newStatus });
  });

  // 4. Delete Coupon (Merchant)
  fastify.post('/api/merchant/coupons/delete', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const body = (req.body || {}) as any;
    const couponId = parseInt(body.id, 10);
    const coupon = dbFetchOne<any>('coupons', { id: couponId, store_id: store.id });
    if (!coupon) return reply.code(404).send({ success: false, error: 'Coupon not found' });

    dbDelete('coupons', { id: couponId, store_id: store.id });
    return reply.send({ success: true });
  });

  // 5. Validate Promo Code on Checkout (Public Storefront)
  fastify.post('/api/coupons/validate', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as any;
    const storeId = parseInt(body.store_id, 10);
    const code = (body.code || '').trim().toUpperCase();
    const subtotal = parseFloat(body.subtotal || 0);

    if (!storeId || !code) {
      return reply.code(400).send({ success: false, error: 'Store ID and coupon code are required' });
    }

    const coupon = dbFetchOne<any>('coupons', { store_id: storeId, code, status: 'active' });
    if (!coupon) {
      return reply.code(404).send({ success: false, error: 'Invalid or inactive promo code' });
    }

    // Check expiration
    if (coupon.expires_at) {
      const expiryDate = new Date(coupon.expires_at);
      if (expiryDate < new Date()) {
        return reply.code(400).send({ success: false, error: 'This promo code has expired' });
      }
    }

    // Check usage limits
    if (coupon.max_uses > 0 && coupon.uses_count >= coupon.max_uses) {
      return reply.code(400).send({ success: false, error: 'This promo code has reached its maximum usage limit' });
    }

    // Check minimum order amount
    if (coupon.min_order_amount > 0 && subtotal < coupon.min_order_amount) {
      return reply.code(400).send({
        success: false,
        error: `Minimum order amount for this code is ${formatCurrency(coupon.min_order_amount)}`
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (subtotal * coupon.discount_value) / 100;
    } else {
      discountAmount = Math.min(coupon.discount_value, subtotal);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    const finalSubtotal = Math.max(0, subtotal - discountAmount);

    return reply.send({
      success: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount: discountAmount,
      discount_amount_formatted: formatCurrency(discountAmount),
      final_subtotal: finalSubtotal,
      final_subtotal_formatted: formatCurrency(finalSubtotal)
    });
  });

  // 6. Request Store Verification (Merchant)
  fastify.post('/api/merchant/verification/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    if (currentStore.is_verified) {
      return reply.send({ success: true, message: 'Store is already verified', is_verified: true });
    }

    // Check eligibility: minimum 3 completed/paid orders or active store
    const orders = dbFetchAll<any>('orders', { store_id: store.id, payment_status: 'paid' });
    const items = dbFetchAll<any>('items', { store_id: store.id, is_available: 1 });

    const isEligible = orders.length >= 1 || items.length >= 2;
    dbUpdate('stores', { verification_requested: 1 }, { id: store.id });

    return reply.send({
      success: true,
      eligible: isEligible,
      verification_requested: true,
      paid_orders_count: orders.length,
      active_products_count: items.length,
      message: 'Verification request submitted. Our compliance team will review your storefront.'
    });
  });

  // 7. Store Verification Eligibility Status
  fastify.get('/api/merchant/verification/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });

    const currentStore = dbFetchOne<any>('stores', { id: store.id }) || store;
    const paidOrders = dbFetchAll<any>('orders', { store_id: store.id, payment_status: 'paid' });
    const reviews = dbFetchAll<any>('reviews', { store_id: store.id, status: 'published' });
    const items = dbFetchAll<any>('items', { store_id: store.id, is_available: 1 });

    const avgRating = reviews.length > 0 
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : '5.0';

    return reply.send({
      success: true,
      is_verified: Boolean(currentStore.is_verified),
      verification_requested: Boolean(currentStore.verification_requested),
      metrics: {
        paid_orders_count: paidOrders.length,
        items_count: items.length,
        reviews_count: reviews.length,
        avg_rating: avgRating,
        has_bank_details: Boolean(currentStore.bank_account_number),
        has_logo: Boolean(currentStore.logo_url)
      }
    });
  });
};
