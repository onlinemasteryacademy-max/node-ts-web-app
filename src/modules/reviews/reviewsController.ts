import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyPurchaseEligibility,
  submitVerifiedReview,
  moderateReview,
  getPublicStoreReviews,
  getMerchantReviewsList
} from './reviewsService.js';

export const reviewsRoutes: FastifyPluginAsync = async (fastify) => {

  // 1. Get Public Storefront Reviews (Approved Only)
  fastify.get('/api/stores/:storeId/reviews', async (req: FastifyRequest<{ Params: { storeId: string } }>, reply: FastifyReply) => {
    const storeId = parseInt(req.params.storeId, 10);
    if (!storeId || isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'Valid Store ID required' });
    }

    const query = (req.query || {}) as Record<string, any>;
    const itemId = query.item_id ? parseInt(query.item_id, 10) : null;

    const data = getPublicStoreReviews(storeId, itemId);
    return reply.send({
      success: true,
      reviews: data.reviews,
      total: data.total,
      average_rating: data.average_rating,
      distribution: data.distribution
    });
  });

  // 2. Customer Phone & Purchase Verification Endpoint (Anti-Scraping / Rate-Limited)
  fastify.post('/api/stores/:storeId/reviews/verify', async (req: FastifyRequest<{ Params: { storeId: string } }>, reply: FastifyReply) => {
    const storeId = parseInt(req.params.storeId, 10);
    if (!storeId || isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'Valid Store ID required' });
    }

    const body = (req.body || {}) as any;
    const itemId = parseInt(body.item_id, 10);
    const rawPhone = String(body.phone || body.customer_phone || '').trim();

    if (!itemId || isNaN(itemId)) {
      return reply.code(400).send({ success: false, error: 'Valid product selection required' });
    }

    if (!rawPhone) {
      return reply.code(400).send({ success: false, error: 'Please enter the phone number used when placing your order' });
    }

    const clientIp = req.ip || '127.0.0.1';
    const result = verifyPurchaseEligibility(storeId, itemId, rawPhone, clientIp);

    if (!result.eligible) {
      return reply.code(400).send({
        success: false,
        error: result.error || "We couldn't verify a qualifying purchase for this product using that phone number."
      });
    }

    return reply.send({
      success: true,
      token: result.token,
      customer_name: result.customer_name,
      is_verified_purchase: result.is_verified_purchase === 1,
      existing_review: result.existing_review,
      message: result.existing_review 
        ? 'Purchase verified! You can update your previous review.' 
        : 'Purchase verified! You can now write your review.'
    });
  });

  // 3. Submit Purchase-Verified Review
  fastify.post('/api/stores/:storeId/reviews', async (req: FastifyRequest<{ Params: { storeId: string } }>, reply: FastifyReply) => {
    const storeId = parseInt(req.params.storeId, 10);
    if (!storeId || isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'Valid Store ID required' });
    }

    const body = (req.body || {}) as any;
    const token = String(body.token || '').trim();
    const rating = parseInt(body.rating, 10);
    const comment = String(body.comment || '').trim();
    const customerName = body.customer_name ? String(body.customer_name).trim() : undefined;

    if (!token) {
      return reply.code(400).send({
        success: false,
        error: 'Verification session required. Please verify your purchase phone number first.'
      });
    }

    const result = submitVerifiedReview({
      token,
      rating,
      comment,
      customer_name: customerName
    });

    if (!result.success) {
      return reply.code(400).send({ success: false, error: result.error });
    }

    return reply.send({
      success: true,
      is_update: result.is_update,
      review: result.review,
      message: result.is_update
        ? 'Review updated successfully! It will appear once approved by the merchant.'
        : 'Review submitted successfully! It will appear once approved by the merchant.'
    });
  });

  // 4. Merchant Console: List All Reviews with Filters
  fastify.get('/api/merchant/reviews', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
    }

    const query = (req.query || {}) as Record<string, any>;
    const status = query.status ? String(query.status) : undefined;
    const itemId = query.item_id ? parseInt(query.item_id, 10) : undefined;
    const rating = query.rating ? parseInt(query.rating, 10) : undefined;

    const data = getMerchantReviewsList(store.id, { status, item_id: itemId, rating });
    return reply.send({
      success: true,
      reviews: data.reviews,
      pending_count: data.pending_count,
      total: data.total
    });
  });

  // 5. Merchant Console: Moderate Review (Approve / Reject)
  fastify.post('/api/merchant/reviews/:reviewId/moderate', async (req: FastifyRequest<{ Params: { reviewId: string } }>, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
    }

    const reviewId = parseInt(req.params.reviewId, 10);
    if (!reviewId || isNaN(reviewId)) {
      return reply.code(400).send({ success: false, error: 'Valid review ID required' });
    }

    const body = (req.body || {}) as any;
    const action = String(body.action || '').toLowerCase() as 'approve' | 'reject';
    const reason = body.reason ? String(body.reason).trim() : undefined;

    if (action !== 'approve' && action !== 'reject') {
      return reply.code(400).send({ success: false, error: 'Action must be approve or reject' });
    }

    const result = moderateReview(store.id, reviewId, action, store.store_name || 'Store Owner', reason);
    if (!result.success) {
      const statusCode = result.error?.includes('Unauthorized') ? 403 : 400;
      return reply.code(statusCode).send({ success: false, error: result.error });
    }

    return reply.send({
      success: true,
      message: action === 'approve' ? 'Review approved for public display' : 'Review rejected and hidden from public',
      review: result.review
    });
  });

  // Legacy compatibility: toggle route
  fastify.post('/api/merchant/reviews/toggle', async (req: FastifyRequest, reply: FastifyReply) => {
    const store = (req as any).session?.merchantStore;
    if (!store) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
    }

    const body = (req.body || {}) as any;
    const reviewId = parseInt(body.id, 10);
    if (!reviewId || isNaN(reviewId)) {
      return reply.code(400).send({ success: false, error: 'Valid review ID required' });
    }

    const action = body.status === 'published' || body.status === 'approved' ? 'approve' : 'reject';
    const result = moderateReview(store.id, reviewId, action, store.store_name || 'Store Owner');

    if (!result.success) {
      return reply.code(400).send({ success: false, error: result.error });
    }

    return reply.send({ success: true, status: result.review.status });
  });
};
