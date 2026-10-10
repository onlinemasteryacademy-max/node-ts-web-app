"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainsRoutes = void 0;
const db_js_1 = require("../../db/db.js");
const helpers_js_1 = require("../../utils/helpers.js");
const promises_1 = __importDefault(require("node:dns/promises"));
const domainsRoutes = async (fastify) => {
    // 1. Get Custom Domain Status
    fastify.get('/api/merchant/custom-domain/status', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const { isBusiness } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
        if (!currentStore.custom_domain) {
            return reply.send({
                success: true,
                configured: false,
                is_business: isBusiness,
                domain: null,
                status: 'none'
            });
        }
        let verified = false;
        let dnsRecordFound = false;
        try {
            const cnames = await promises_1.default.resolveCname(currentStore.custom_domain);
            if (cnames && cnames.length > 0) {
                dnsRecordFound = true;
                verified = true;
            }
        }
        catch (e) {
            // In development or if DNS is not yet propagated
            dnsRecordFound = false;
        }
        const currentStatus = verified ? 'verified' : 'pending_dns';
        if (currentStore.custom_domain_status !== currentStatus) {
            (0, db_js_1.dbUpdate)('stores', { custom_domain_status: currentStatus }, { id: currentStore.id });
        }
        return reply.send({
            success: true,
            configured: true,
            is_business: isBusiness,
            domain: currentStore.custom_domain,
            status: currentStatus,
            cname_target: 'cname.zlik.me'
        });
    });
    // 2. Connect Custom Domain (Business Plan Feature)
    fastify.post('/api/merchant/custom-domain', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = (0, db_js_1.dbFetchOne)('stores', { id: store.id }) || store;
        const { isBusiness } = (0, helpers_js_1.getStorePlanDetails)(currentStore);
        if (!isBusiness) {
            return reply.code(403).send({
                success: false,
                error: 'Custom domain mapping (e.g. shop.yourbrand.com) is a Business plan feature. Please upgrade to Business.'
            });
        }
        const body = (req.body || {});
        let domain = body.domain?.trim().toLowerCase();
        if (!domain) {
            return reply.code(400).send({ success: false, error: 'Domain name is required (e.g. shop.mybrand.com).' });
        }
        // Sanitize domain
        domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
        // Check if domain is already claimed by another store
        const existing = (0, db_js_1.dbFetchOne)('stores', { custom_domain: domain });
        if (existing && existing.id !== currentStore.id) {
            return reply.code(400).send({ success: false, error: 'This domain is already mapped to another store on Zlik.' });
        }
        (0, db_js_1.dbUpdate)('stores', {
            custom_domain: domain,
            custom_domain_status: 'pending_dns'
        }, { id: currentStore.id });
        return reply.send({
            success: true,
            domain,
            status: 'pending_dns',
            cname_target: 'cname.zlik.me',
            instructions: `Add a CNAME record in your DNS provider pointing ${domain} to cname.zlik.me`
        });
    });
    // 3. Remove Custom Domain
    fastify.delete('/api/merchant/custom-domain', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        (0, db_js_1.dbUpdate)('stores', {
            custom_domain: null,
            custom_domain_status: 'unverified'
        }, { id: store.id });
        return reply.send({ success: true });
    });
};
exports.domainsRoutes = domainsRoutes;
