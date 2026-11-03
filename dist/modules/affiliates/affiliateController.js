"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.affiliateRoutes = affiliateRoutes;
const affiliateService_js_1 = require("./affiliateService.js");
const bankVerificationController_js_1 = require("../verification/bankVerificationController.js");
async function affiliateRoutes(fastify) {
    /**
     * 1. Register as an Affiliate Partner
     */
    fastify.post('/api/affiliates/register', async (req, reply) => {
        const body = (req.body || {});
        const result = await (0, affiliateService_js_1.registerAffiliate)({
            fullName: body.full_name || body.name,
            email: body.email,
            phone: body.phone || body.whatsapp_number,
            password: body.password || body.pin
        });
        if (!result.success) {
            return reply.code(400).send({ success: false, error: result.error });
        }
        req.session.affiliate = result.affiliate;
        return reply.send({
            success: true,
            message: 'Affiliate account created successfully!',
            affiliate: result.affiliate,
            redirect: '/affiliates/dashboard'
        });
    });
    /**
     * 2. Affiliate Sign In
     */
    fastify.post('/api/affiliates/login', async (req, reply) => {
        const body = (req.body || {});
        const identifier = (body.identifier || body.email || body.phone || '').trim();
        const password = (body.password || body.pin || '').trim();
        const result = await (0, affiliateService_js_1.loginAffiliate)(identifier, password);
        if (!result.success) {
            return reply.code(400).send({ success: false, error: result.error });
        }
        req.session.affiliate = result.affiliate;
        return reply.send({
            success: true,
            message: 'Signed in successfully!',
            affiliate: result.affiliate,
            redirect: '/affiliates/dashboard'
        });
    });
    /**
     * 3. Affiliate Logout
     */
    fastify.get('/affiliates/logout', async (req, reply) => {
        req.session.affiliate = null;
        return reply.redirect('/affiliates');
    });
    /**
     * 4. Get Current Affiliate Profile & Dashboard Data
     */
    fastify.get('/api/affiliates/me', async (req, reply) => {
        const sessionAff = req.session?.affiliate;
        if (!sessionAff) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Please log in as an affiliate' });
        }
        const data = (0, affiliateService_js_1.getAffiliateDashboardData)(sessionAff.id);
        if (!data) {
            return reply.code(404).send({ success: false, error: 'Affiliate record not found' });
        }
        // Refresh session data
        req.session.affiliate = data.affiliate;
        return reply.send({
            success: true,
            ...data,
            banks: bankVerificationController_js_1.NIGERIAN_BANKS
        });
    });
    /**
     * 5. Update Payout Bank Details
     */
    fastify.post('/api/affiliates/bank', async (req, reply) => {
        const sessionAff = req.session?.affiliate;
        if (!sessionAff) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Please log in as an affiliate' });
        }
        const body = (req.body || {});
        const result = (0, affiliateService_js_1.updateAffiliateBankDetails)(sessionAff.id, body.bank_name, body.account_number, body.account_name, body.bank_code);
        if (!result.success) {
            return reply.code(400).send({ success: false, error: result.error });
        }
        req.session.affiliate = result.affiliate;
        return reply.send({
            success: true,
            message: 'Bank account details updated successfully!',
            affiliate: result.affiliate
        });
    });
    /**
     * 6. Request Payout (Enforces ₦10,000 Minimum)
     */
    fastify.post('/api/affiliates/payouts/request', async (req, reply) => {
        const sessionAff = req.session?.affiliate;
        if (!sessionAff) {
            return reply.code(401).send({ success: false, error: 'Unauthorized: Please log in as an affiliate' });
        }
        const body = (req.body || {});
        const result = (0, affiliateService_js_1.requestAffiliatePayout)(sessionAff.id, body.amount ? Number(body.amount) : undefined);
        if (!result.success) {
            return reply.code(400).send({ success: false, error: result.error });
        }
        return reply.send({
            success: true,
            message: `Withdrawal request for ₦${result.amount?.toLocaleString()} submitted successfully! Funds will be reviewed and disbursed.`,
            payoutId: result.payoutId,
            amount: result.amount
        });
    });
    /**
     * 7. Affiliate Landing Page View
     */
    fastify.get('/affiliates', async (req, reply) => {
        const sessionAff = req.session?.affiliate;
        if (sessionAff) {
            return reply.redirect('/affiliates/dashboard');
        }
        return reply.view('affiliates/landing.ejs', {
            title: 'Affiliate Partner Program - Zlik',
            metaDescription: 'Earn 70% recurring commissions for up to 12 months with Zlik. Official Partner of The Online Mastery.',
            cookieDays: 60,
            commissionRate: 70,
            minWithdrawal: 10000
        });
    });
    /**
     * 8. Affiliate Dashboard View
     */
    fastify.get('/affiliates/dashboard', async (req, reply) => {
        const sessionAff = req.session?.affiliate;
        if (!sessionAff) {
            return reply.redirect('/affiliates');
        }
        const data = (0, affiliateService_js_1.getAffiliateDashboardData)(sessionAff.id);
        if (!data) {
            req.session.affiliate = null;
            return reply.redirect('/affiliates');
        }
        // Keep session current
        req.session.affiliate = data.affiliate;
        return reply.view('affiliates/dashboard.ejs', {
            title: 'Affiliate Dashboard - Zlik',
            affiliate: data.affiliate,
            referrals: data.referrals,
            commissions: data.commissions,
            payouts: data.payouts,
            banks: bankVerificationController_js_1.NIGERIAN_BANKS,
            appUrl: `https://${req.hostname}`,
            minWithdrawal: 10000
        });
    });
}
