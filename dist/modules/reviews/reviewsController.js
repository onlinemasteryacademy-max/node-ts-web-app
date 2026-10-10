import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
export const reviewsRoutes = async (fastify) => {
    // 1. Get Reviews for Storefront (Public)
    fastify.get('/api/stores/:storeId/reviews', async (req, reply) => {
        const storeId = parseInt(req.params.storeId, 10);
        if (!storeId)
            return reply.code(400).send({ success: false, error: 'Valid Store ID required' });
        const query = (req.query || {});
        const itemId = query.item_id ? parseInt(query.item_id, 10) : null;
        let reviews = [];
        if (itemId) {
            reviews = dbFetchAll('reviews', { store_id: storeId, item_id: itemId, status: 'published' }, 'id DESC');
        }
        else {
            reviews = dbFetchAll('reviews', { store_id: storeId, status: 'published' }, 'id DESC');
        }
        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0
            ? (reviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / totalReviews).toFixed(1)
            : '5.0';
        return reply.send({
            success: true,
            reviews,
            total: totalReviews,
            average_rating: parseFloat(avgRating)
        });
    });
    // 2. Submit Review (Public Customer)
    fastify.post('/api/stores/:storeId/reviews', async (req, reply) => {
        const storeId = parseInt(req.params.storeId, 10);
        if (!storeId)
            return reply.code(400).send({ success: false, error: 'Valid Store ID required' });
        const body = (req.body || {});
        const customerName = (body.customer_name || 'Customer').trim();
        const customerPhone = (body.customer_phone || '').trim();
        const rating = Math.min(5, Math.max(1, parseInt(body.rating || 5, 10)));
        const comment = (body.comment || '').trim();
        const itemId = body.item_id ? parseInt(body.item_id, 10) : null;
        if (!comment) {
            return reply.code(400).send({ success: false, error: 'Please write a brief review comment' });
        }
        const reviewId = dbInsert('reviews', {
            store_id: storeId,
            item_id: itemId,
            customer_name: customerName,
            customer_phone: customerPhone,
            rating,
            comment,
            status: 'published'
        });
        const newReview = dbFetchOne('reviews', { id: reviewId });
        return reply.send({ success: true, review: newReview, message: 'Review submitted successfully!' });
    });
    // 3. List All Reviews (Merchant Console)
    fastify.get('/api/merchant/reviews', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const reviews = dbFetchAll('reviews', { store_id: store.id }, 'id DESC');
        return reply.send({ success: true, reviews });
    });
    // 4. Toggle Review Visibility (Merchant Console)
    fastify.post('/api/merchant/reviews/toggle', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const body = (req.body || {});
        const reviewId = parseInt(body.id, 10);
        const review = dbFetchOne('reviews', { id: reviewId, store_id: store.id });
        if (!review)
            return reply.code(404).send({ success: false, error: 'Review not found' });
        const newStatus = review.status === 'published' ? 'hidden' : 'published';
        dbUpdate('reviews', { status: newStatus }, { id: reviewId });
        return reply.send({ success: true, status: newStatus });
    });
};
