"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHITELISTED_PROVIDER_HOSTS = void 0;
exports.validateOutboundUrl = validateOutboundUrl;
const node_url_1 = require("node:url");
/**
 * Standard Whitelisted Hosts for Identity & Bank Verification
 */
exports.WHITELISTED_PROVIDER_HOSTS = {
    monnify: ['sandbox.monnify.com', 'api.monnify.com'],
    paystack: ['api.paystack.co']
};
/**
 * Server-Side Request Forgery (SSRF) Guard
 * Strictly verifies that outbound requests target safe, whitelisted, public HTTPS endpoints.
 */
function validateOutboundUrl(targetUrl, allowedHosts = ['sandbox.monnify.com', 'api.monnify.com']) {
    if (!targetUrl || typeof targetUrl !== 'string') {
        return { valid: false, error: 'Target URL is missing or invalid' };
    }
    try {
        const parsed = new node_url_1.URL(targetUrl.trim());
        // 1. Strict Protocol check: HTTPS only
        if (parsed.protocol !== 'https:') {
            return { valid: false, error: `Disallowed protocol '${parsed.protocol}'. Outbound verification requests must strictly use HTTPS.` };
        }
        // 2. Strict Port check: 443 only (or default https port)
        if (parsed.port && parsed.port !== '443') {
            return { valid: false, error: `Disallowed port '${parsed.port}'. Requests must use standard HTTPS port 443.` };
        }
        const hostname = parsed.hostname.toLowerCase();
        // 3. Prohibit IP literals, loopbacks, link-local, and private addresses
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':') || hostname.startsWith('[');
        if (isIp) {
            return { valid: false, error: `Direct IP addresses are strictly prohibited for outbound verification requests.` };
        }
        if (hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local') ||
            hostname.endsWith('.internal')) {
            return { valid: false, error: `Internal hostnames are blocked to prevent SSRF.` };
        }
        // 4. Strict Whitelist Check
        const isWhitelisted = allowedHosts.some(allowed => hostname === allowed.toLowerCase());
        if (!isWhitelisted) {
            return { valid: false, error: `Host '${hostname}' is not in the approved provider whitelist [${allowedHosts.join(', ')}].` };
        }
        return { valid: true };
    }
    catch (err) {
        return { valid: false, error: `Malformed URL: ${err.message || 'Unable to parse'}` };
    }
}
