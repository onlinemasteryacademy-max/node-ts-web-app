"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificationRoutes = verificationRoutes;
const db_js_1 = require("../../db/db.js");
const securityService_js_1 = require("../security/securityService.js");
const verificationService_js_1 = require("./verificationService.js");
const businessVerificationService_js_1 = require("./businessVerificationService.js");
async function verificationRoutes(fastify) {
    /**
     * GET /api/merchant/verification/status
     * Live Verification & Gating Status for Merchant Store (Unified security status + store readiness metrics)
     */
    fastify.get('/api/merchant/verification/status', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const seller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const isGated = (0, securityService_js_1.isStoreOrderGated)(store.id);
        const bankAccounts = (0, db_js_1.dbFetchAll)('seller_bank_accounts', { seller_id: seller.id });
        const verifications = (0, db_js_1.dbFetchAll)('seller_verifications', { seller_id: seller.id }, 'id DESC');
        const business = (0, businessVerificationService_js_1.getBusinessProfile)(seller.id);
        // Compute storefront trust & readiness metrics
        const paidOrders = (0, db_js_1.dbFetchAll)('orders', { store_id: store.id, payment_status: 'paid' });
        const reviews = (0, db_js_1.dbFetchAll)('reviews', { store_id: store.id, status: 'published' });
        const items = (0, db_js_1.dbFetchAll)('items', { store_id: store.id, is_available: 1 });
        const avgRating = reviews.length > 0
            ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
            : '5.0';
        const isVerified = Boolean(currentStore.is_verified || seller.composite_verification_status === 'verified');
        const verificationRequested = Boolean(currentStore.verification_requested);
        return reply.send({
            success: true,
            // Security & Trust Profile
            seller_profile: seller,
            business_profile: business,
            is_gated: isGated,
            composite_status: seller.composite_verification_status,
            identity_status: seller.identity_status,
            bank_status: seller.bank_status,
            business_status: seller.business_status,
            bank_accounts: bankAccounts,
            verifications: verifications,
            // Store Eligibility & Readiness Compatibility
            is_verified: isVerified,
            verification_requested: verificationRequested,
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
    /**
     * POST /api/merchant/verification/submit-identity
     * Submit BVN or NIN with Mandatory NDPA 2023 Consent
     */
    fastify.post('/api/merchant/verification/submit-identity', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const body = req.body || {};
        const type = String(body.type || '').trim().toLowerCase();
        const identifier = String(body.identifier || '').trim().replace(/[^0-9]/g, '');
        const consentGiven = Boolean(body.consent_given);
        const firstName = body.first_name ? String(body.first_name).trim() : undefined;
        const lastName = body.last_name ? String(body.last_name).trim() : undefined;
        const dateOfBirth = body.date_of_birth ? String(body.date_of_birth).trim() : undefined;
        const phoneNumber = body.phone_number ? String(body.phone_number).trim() : undefined;
        if (type !== 'bvn' && type !== 'nin') {
            return reply.code(400).send({
                success: false,
                error: 'Verification type must be either "bvn" or "nin"'
            });
        }
        if (identifier.length !== 11) {
            return reply.code(400).send({
                success: false,
                error: `${type.toUpperCase()} must be exactly 11 numeric digits`
            });
        }
        if (!consentGiven) {
            return reply.code(400).send({
                success: false,
                error: 'NDPA 2023 Compliance Mandate: Explicit seller consent is legally required before processing identity credentials'
            });
        }
        const seller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const result = await (0, verificationService_js_1.submitIdentityVerification)({
            sellerId: seller.id,
            type: type,
            identifier,
            consentGiven,
            firstName,
            lastName,
            dateOfBirth,
            phoneNumber
        });
        // Refresh composite status and store session
        (0, verificationService_js_1.evaluateCompositeVerificationStatus)(seller.id);
        const updatedSeller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const updatedStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
        req.session.merchantStore = updatedStore;
        const isGated = (0, securityService_js_1.isStoreOrderGated)(store.id);
        if (result.success) {
            return reply.send({
                success: true,
                message: 'Identity successfully verified against regulatory database.',
                status: updatedSeller.identity_status,
                composite_status: updatedSeller.composite_verification_status,
                is_gated: isGated
            });
        }
        else {
            return reply.send({
                success: false,
                status: updatedSeller.identity_status,
                composite_status: updatedSeller.composite_verification_status,
                is_gated: isGated,
                error: result.error || 'Identity verification could not be completed.'
            });
        }
    });
    /**
     * POST /api/merchant/verification/submit-business
     * Submit Registered Business (CAC) Verification
     */
    fastify.post('/api/merchant/verification/submit-business', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        }
        const body = req.body || {};
        const registeredName = String(body.registered_name || '').trim();
        const registrationNumber = String(body.registration_number || '').trim();
        const businessType = String(body.business_type || 'sole_proprietorship').trim();
        const representativeName = String(body.representative_name || '').trim();
        const representativeRole = String(body.representative_role || 'Proprietor').trim();
        const representativePhone = String(body.representative_phone || '').trim();
        const tin = body.tin ? String(body.tin).trim() : undefined;
        const registeredAddress = body.registered_address ? String(body.registered_address).trim() : undefined;
        const documentUrl = body.document_url ? String(body.document_url).trim() : undefined;
        if (!registeredName || !registrationNumber || !representativeName || !representativePhone) {
            return reply.code(400).send({
                success: false,
                error: 'Registered company name, CAC registration number, authorized representative name and phone number are required.'
            });
        }
        const seller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const result = await (0, businessVerificationService_js_1.submitBusinessVerification)({
            sellerId: seller.id,
            registeredName,
            registrationNumber,
            businessType,
            tin,
            registeredAddress,
            representativeName,
            representativeRole,
            representativePhone,
            documentUrl,
            actorType: 'merchant',
            ipAddress: req.ip
        });
        (0, verificationService_js_1.evaluateCompositeVerificationStatus)(seller.id);
        const updatedSeller = (0, securityService_js_1.getOrCreateSellerProfile)(store.id);
        const updatedStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id });
        req.session.merchantStore = updatedStore;
        const isGated = (0, securityService_js_1.isStoreOrderGated)(store.id);
        if (result.success) {
            return reply.send({
                success: true,
                message: result.status === 'verified'
                    ? 'Registered business successfully verified.'
                    : 'Business details submitted for compliance review. Orders will remain gated until verification is approved.',
                status: updatedSeller.business_status,
                composite_status: updatedSeller.composite_verification_status,
                is_gated: isGated,
                business_profile: result.businessProfile
            });
        }
        else {
            return reply.code(400).send({
                success: false,
                status: updatedSeller.business_status,
                composite_status: updatedSeller.composite_verification_status,
                is_gated: isGated,
                error: result.error || 'Business verification could not be submitted.'
            });
        }
    });
}
