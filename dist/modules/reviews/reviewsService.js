"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetVerificationRateLimits = resetVerificationRateLimits;
exports.hashCustomerPhone = hashCustomerPhone;
exports.generateVerificationToken = generateVerificationToken;
exports.verifyVerificationToken = verifyVerificationToken;
exports.checkVerificationRateLimit = checkVerificationRateLimit;
exports.verifyPurchaseEligibility = verifyPurchaseEligibility;
exports.submitVerifiedReview = submitVerifiedReview;
exports.moderateReview = moderateReview;
exports.getPublicStoreReviews = getPublicStoreReviews;
exports.getMerchantReviewsList = getMerchantReviewsList;
const node_crypto_1 = __importDefault(require("node:crypto"));
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const env_js_1 = require("../../config/env.js");
// Rate Limiter Storage for Review Verification: IP -> { attempts: number, resetAt: number }
const verificationRateLimits = new Map();
const VERIFY_LIMIT = 10; // Max 10 verification attempts per window
const VERIFY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
function resetVerificationRateLimits() {
    verificationRateLimits.clear();
}
/**
 * Keyed HMAC-SHA256 hash of normalized phone number to prevent raw phone exposure while maintaining uniqueness
 */
function hashCustomerPhone(normalizedPhone) {
    const secret = env_js_1.ENV.SESSION_SECRET || 'zlik-reviews-secret-salt';
    return node_crypto_1.default.createHmac('sha256', secret).update(normalizedPhone).digest('hex');
}
/**
 * Generate signed, tamper-proof verification token
 */
function generateVerificationToken(payload) {
    const secret = env_js_1.ENV.SESSION_SECRET || 'zlik-reviews-secret-salt';
    const data = JSON.stringify(payload);
    const dataBase64 = Buffer.from(data, 'utf8').toString('base64url');
    const signature = node_crypto_1.default.createHmac('sha256', secret).update(dataBase64).digest('base64url');
    return `${dataBase64}.${signature}`;
}
/**
 * Verify and decode signed verification token
 */
function verifyVerificationToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return { valid: false, error: 'Invalid verification token format' };
    }
    const [dataBase64, signature] = token.split('.');
    const secret = env_js_1.ENV.SESSION_SECRET || 'zlik-reviews-secret-salt';
    const expectedSignature = node_crypto_1.default.createHmac('sha256', secret).update(dataBase64).digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expBuf.length || !node_crypto_1.default.timingSafeEqual(sigBuf, expBuf)) {
        return { valid: false, error: 'Tampered or invalid verification token' };
    }
    try {
        const rawData = Buffer.from(dataBase64, 'base64url').toString('utf8');
        const payload = JSON.parse(rawData);
        if (Date.now() > payload.exp) {
            return { valid: false, error: 'Verification token has expired. Please verify your purchase again.' };
        }
        return { valid: true, payload };
    }
    catch (e) {
        return { valid: false, error: 'Malformed verification token payload' };
    }
}
/**
 * Check and increment rate limit for phone verification
 */
function checkVerificationRateLimit(identifier) {
    const now = Date.now();
    const entry = verificationRateLimits.get(identifier);
    if (!entry || now > entry.resetAt) {
        verificationRateLimits.set(identifier, { attempts: 1, resetAt: now + VERIFY_WINDOW_MS });
        return { allowed: true };
    }
    if (entry.attempts >= VERIFY_LIMIT) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }
    entry.attempts += 1;
    return { allowed: true };
}
/**
 * Verify customer purchase eligibility for a specific product
 */
function verifyPurchaseEligibility(storeId, itemId, rawPhone, clientIp = '127.0.0.1') {
    // 1. Rate Limit Defense
    const rateLimitKey = `${clientIp}_${storeId}`;
    const rateCheck = checkVerificationRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
        return {
            eligible: false,
            error: `Too many verification attempts. Please wait ${rateCheck.retryAfter} seconds before trying again.`
        };
    }
    // 2. Validate input product and store
    if (!storeId || !itemId) {
        return { eligible: false, error: 'Valid store and product IDs are required.' };
    }
    const store = (0, db_js_1.dbFetchOne)('stores', { id: storeId });
    if (!store) {
        return { eligible: false, error: 'Store not found.' };
    }
    const product = (0, db_js_1.dbFetchOne)('items', { id: itemId, store_id: storeId });
    if (!product) {
        return { eligible: false, error: 'Product not found in this store.' };
    }
    // 3. Normalize Phone Number
    const normalizedPhone = (0, helpers_js_1.normalizePhoneNumber)(rawPhone);
    if (!normalizedPhone || normalizedPhone.length < 8) {
        return {
            eligible: false,
            error: "We couldn't verify a qualifying purchase for this product using that phone number."
        };
    }
    // 4. Query matching orders strictly for this merchant
    // Matches either customer_phone directly or customer record associated with order
    const orders = (0, db_js_1.dbFetchAll)('orders', { store_id: storeId }, 'id DESC');
    // Eligible statuses:
    // - completed, dispatched, confirmed: Eligible (is_verified_purchase = 1)
    // - cancelled: Eligible for feedback (is_verified_purchase = 0)
    // - pending: Ineligible (unprocessed)
    // - any other: Ineligible
    const candidateOrders = [];
    for (const order of orders) {
        const orderPhoneNorm = (0, helpers_js_1.normalizePhoneNumber)(order.customer_phone);
        if (orderPhoneNorm !== normalizedPhone) {
            continue;
        }
        // Check order status eligibility rules
        const status = String(order.order_status || '').toLowerCase().trim();
        let isVerified = 1;
        let weight = 0;
        if (['completed', 'delivered', 'successful'].includes(status)) {
            isVerified = 1;
            weight = 4;
        }
        else if (['dispatched', 'shipped'].includes(status)) {
            isVerified = 1;
            weight = 3;
        }
        else if (['confirmed', 'paid', 'processing'].includes(status)) {
            isVerified = 1;
            weight = 2;
        }
        else if (['cancelled', 'canceled'].includes(status)) {
            isVerified = 0;
            weight = 1; // Eligible for feedback on ordering experience
        }
        else {
            // 'pending' or unknown -> strictly ineligible
            continue;
        }
        // Check if this order contains the specific product
        let itemsInOrder = [];
        try {
            itemsInOrder = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
        }
        catch (e) {
            itemsInOrder = [];
        }
        const hasProduct = itemsInOrder.some(it => {
            if (it.id && Number(it.id) === Number(itemId))
                return true;
            if (it.item_id && Number(it.item_id) === Number(itemId))
                return true;
            // Fallback matching if product title matches exactly
            if (it.title && product.title && it.title.trim().toLowerCase() === product.title.trim().toLowerCase())
                return true;
            return false;
        });
        if (hasProduct) {
            candidateOrders.push({ order, isVerifiedPurchase: isVerified, statusWeight: weight });
        }
    }
    if (candidateOrders.length === 0) {
        return {
            eligible: false,
            error: "We couldn't verify a qualifying purchase for this product using that phone number."
        };
    }
    // Select the highest quality qualifying order (e.g. completed over cancelled)
    candidateOrders.sort((a, b) => b.statusWeight - a.statusWeight);
    const bestQualifying = candidateOrders[0];
    const order = bestQualifying.order;
    // 5. Check if user already reviewed this product
    const phoneHash = hashCustomerPhone(normalizedPhone);
    const existingReview = (0, db_js_1.dbFetchOne)('reviews', {
        store_id: storeId,
        item_id: itemId,
        customer_phone_hash: phoneHash
    });
    // 6. Generate signed verification token (15-min expiry)
    const tokenPayload = {
        store_id: storeId,
        item_id: itemId,
        order_id: order.id,
        customer_id: order.customer_id || null,
        customer_name: order.customer_name || 'Verified Customer',
        customer_phone_hash: phoneHash,
        is_verified_purchase: bestQualifying.isVerifiedPurchase,
        order_ref: order.order_ref,
        existing_review_id: existingReview ? existingReview.id : null,
        exp: Date.now() + 15 * 60 * 1000
    };
    const token = generateVerificationToken(tokenPayload);
    return {
        eligible: true,
        token,
        customer_name: order.customer_name || 'Verified Customer',
        is_verified_purchase: bestQualifying.isVerifiedPurchase,
        existing_review: existingReview ? {
            id: existingReview.id,
            rating: existingReview.rating,
            comment: existingReview.comment,
            status: existingReview.status,
            created_at: existingReview.created_at
        } : null
    };
}
/**
 * Submit or update a purchase-verified review
 */
function submitVerifiedReview(input) {
    // 1. Verify cryptographic token
    const tokenCheck = verifyVerificationToken(input.token);
    if (!tokenCheck.valid || !tokenCheck.payload) {
        return { success: false, error: tokenCheck.error || 'Invalid or expired verification session.' };
    }
    const payload = tokenCheck.payload;
    // 2. Validate rating (strictly 1 to 5)
    const rating = Math.round(Number(input.rating));
    if (isNaN(rating) || rating < 1 || rating > 5) {
        return { success: false, error: 'Please select a star rating between 1 and 5.' };
    }
    // 3. Validate and sanitize review comment text
    const cleanComment = String(input.comment || '')
        .trim()
        .replace(/<[^>]*>?/gm, ''); // Strip any HTML tags
    if (cleanComment.length < 5) {
        return { success: false, error: 'Please write at least 5 characters for your review.' };
    }
    if (cleanComment.length > 1000) {
        return { success: false, error: 'Review text cannot exceed 1,000 characters.' };
    }
    const reviewerName = (input.customer_name?.trim() || payload.customer_name || 'Verified Customer').slice(0, 100);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // 4. Check for existing review (duplicate prevention)
    let existingReview = (0, db_js_1.dbFetchOne)('reviews', {
        store_id: payload.store_id,
        item_id: payload.item_id,
        customer_phone_hash: payload.customer_phone_hash
    });
    if (!existingReview && payload.existing_review_id) {
        existingReview = (0, db_js_1.dbFetchOne)('reviews', { id: payload.existing_review_id });
    }
    let reviewId;
    let isUpdate = false;
    if (existingReview) {
        // Update existing review: resets status to 'pending_review' so merchant can re-moderate
        (0, db_js_1.dbUpdate)('reviews', {
            rating,
            comment: cleanComment,
            customer_name: reviewerName,
            is_verified_purchase: payload.is_verified_purchase,
            status: 'pending_review',
            moderated_at: null,
            moderated_by: null,
            rejection_reason: null,
            updated_at: now
        }, { id: existingReview.id });
        reviewId = existingReview.id;
        isUpdate = true;
    }
    else {
        // Insert new verified review awaiting moderation
        reviewId = (0, db_js_1.dbInsert)('reviews', {
            store_id: payload.store_id,
            item_id: payload.item_id,
            order_id: payload.order_id,
            customer_id: payload.customer_id,
            customer_name: reviewerName,
            customer_phone_hash: payload.customer_phone_hash,
            rating,
            comment: cleanComment,
            is_verified_purchase: payload.is_verified_purchase,
            status: 'pending_review',
            created_at: now,
            updated_at: now
        });
    }
    // 5. Emit Notification Event for Merchant Dashboard
    try {
        const product = (0, db_js_1.dbFetchOne)('items', { id: payload.item_id });
        const productTitle = product?.title || 'Product';
        (0, db_js_1.dbInsert)('notification_events', {
            store_id: payload.store_id,
            event_type: 'product_review',
            event_reference: `review_${reviewId}`,
            title: `New Review for ${productTitle}`,
            message: `${reviewerName} submitted a ${rating}★ review awaiting moderation.`,
            data_json: JSON.stringify({ review_id: reviewId, item_id: payload.item_id, rating }),
            is_read: 0,
            created_at: now
        });
    }
    catch (e) { }
    const finalReview = (0, db_js_1.dbFetchOne)('reviews', { id: reviewId });
    return { success: true, review: finalReview, is_update: isUpdate };
}
/**
 * Moderate a review (Merchant action)
 */
function moderateReview(merchantStoreId, reviewId, action, moderatorName = 'Store Owner', rejectionReason) {
    if (!merchantStoreId || !reviewId) {
        return { success: false, error: 'Review ID and Merchant authentication required.' };
    }
    const review = (0, db_js_1.dbFetchOne)('reviews', { id: reviewId });
    if (!review) {
        return { success: false, error: 'Review not found.' };
    }
    // Strict ownership check: Merchant can only moderate reviews for their own store
    if (Number(review.store_id) !== Number(merchantStoreId)) {
        return { success: false, error: 'Unauthorized: You do not own this product or review.' };
    }
    if (action !== 'approve' && action !== 'reject') {
        return { success: false, error: 'Invalid moderation action. Must be approve or reject.' };
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    (0, db_js_1.dbUpdate)('reviews', {
        status: newStatus,
        moderated_at: now,
        moderated_by: moderatorName,
        rejection_reason: action === 'reject' ? (rejectionReason || 'Rejected by merchant') : null,
        updated_at: now
    }, { id: reviewId });
    const updatedReview = (0, db_js_1.dbFetchOne)('reviews', { id: reviewId });
    return { success: true, review: updatedReview };
}
/**
 * Get Public Reviews for Storefront (Approved Only)
 */
function getPublicStoreReviews(storeId, itemId) {
    const conditions = {
        store_id: storeId,
        status: 'approved'
    };
    if (itemId) {
        conditions.item_id = itemId;
    }
    const rawReviews = (0, db_js_1.dbFetchAll)('reviews', conditions, 'id DESC');
    const total = rawReviews.length;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sumRating = 0;
    const formattedReviews = rawReviews.map(r => {
        const star = Math.min(5, Math.max(1, Number(r.rating || 5)));
        distribution[star] = (distribution[star] || 0) + 1;
        sumRating += star;
        // Mask name safely (e.g., "Emeka Nwosu" -> "Emeka N.")
        let maskedName = 'Verified Customer';
        if (r.customer_name) {
            const parts = r.customer_name.trim().split(/\s+/);
            if (parts.length > 1) {
                maskedName = `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
            }
            else {
                maskedName = parts[0];
            }
        }
        return {
            id: r.id,
            item_id: r.item_id,
            customer_name: maskedName,
            rating: star,
            comment: r.comment,
            is_verified_purchase: r.is_verified_purchase === 1,
            created_at: r.created_at
        };
    });
    const average_rating = total > 0 ? parseFloat((sumRating / total).toFixed(1)) : 0;
    return {
        reviews: formattedReviews,
        total,
        average_rating,
        distribution
    };
}
/**
 * Get Reviews for Merchant Console (All Moderation States)
 */
function getMerchantReviewsList(storeId, filters = {}) {
    const db = (0, db_js_1.getDb)();
    let sql = `
    SELECT r.*, i.title as product_title, i.image_url as product_image, o.order_ref
    FROM reviews r
    LEFT JOIN items i ON r.item_id = i.id
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.store_id = ?
  `;
    const params = [storeId];
    if (filters.status && filters.status !== 'all') {
        sql += ` AND r.status = ?`;
        params.push(filters.status);
    }
    if (filters.item_id) {
        sql += ` AND r.item_id = ?`;
        params.push(filters.item_id);
    }
    if (filters.rating) {
        sql += ` AND r.rating = ?`;
        params.push(filters.rating);
    }
    sql += ` ORDER BY r.id DESC`;
    const rows = db.prepare(sql).all(...params);
    // Pending count for dashboard badge
    const pendingCountRow = db.prepare(`SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status = 'pending_review'`).get(storeId);
    const pending_count = pendingCountRow ? Number(pendingCountRow.count) : 0;
    return {
        reviews: rows,
        pending_count,
        total: rows.length
    };
}
