"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderConfig = getProviderConfig;
exports.getDecryptedCredentials = getDecryptedCredentials;
exports.saveProviderConfig = saveProviderConfig;
exports.recordProviderTestResult = recordProviderTestResult;
exports.logIntegrationEvent = logIntegrationEvent;
const db_js_1 = require("../../db/db.js");
const securityService_js_1 = require("../security/securityService.js");
const providerInterface_js_1 = require("./providerInterface.js");
/**
 * Get sanitized provider configuration suitable for administrative UI display
 * (Never reveals raw unencrypted secrets)
 */
function getProviderConfig(providerKey = 'monnify') {
    const row = (0, db_js_1.dbFetchOne)('verification_provider_configs', { provider_key: providerKey });
    if (!row)
        return null;
    let enabledCapabilities = ['account_enquiry'];
    try {
        if (row.enabled_capabilities_json) {
            enabledCapabilities = JSON.parse(row.enabled_capabilities_json);
        }
    }
    catch (e) { }
    return {
        id: row.id,
        provider_key: row.provider_key,
        display_name: row.display_name,
        environment: row.environment || 'sandbox',
        base_url: row.base_url,
        api_key_masked: row.api_key_masked || (row.api_key_encrypted ? '••••••••••••' : 'Not configured'),
        contract_code: row.contract_code || '',
        enabled_capabilities: enabledCapabilities,
        status: row.status || 'not_configured',
        last_tested_at: row.last_tested_at,
        last_test_result: row.last_test_result,
        last_test_error: row.last_test_error,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}
/**
 * Retrieve decrypted secrets strictly for internal server-to-server API execution
 */
function getDecryptedCredentials(providerKey = 'monnify') {
    const row = (0, db_js_1.dbFetchOne)('verification_provider_configs', { provider_key: providerKey });
    if (!row) {
        return {
            apiKey: '',
            secretKey: '',
            contractCode: '',
            baseUrl: 'https://sandbox.monnify.com',
            environment: 'sandbox',
            enabledCapabilities: [],
            isConfigured: false
        };
    }
    const apiKey = row.api_key_encrypted ? (0, securityService_js_1.decryptSecret)(row.api_key_encrypted) : '';
    const secretKey = row.secret_key_encrypted ? (0, securityService_js_1.decryptSecret)(row.secret_key_encrypted) : '';
    const contractCode = row.contract_code || '';
    const environment = (row.environment === 'live' || row.environment === 'production') ? 'live' : 'sandbox';
    const baseUrl = environment === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com';
    let enabledCapabilities = [];
    try {
        if (row.enabled_capabilities_json) {
            enabledCapabilities = JSON.parse(row.enabled_capabilities_json);
        }
    }
    catch (e) { }
    const isConfigured = Boolean(apiKey && secretKey);
    return {
        apiKey,
        secretKey,
        contractCode,
        baseUrl,
        environment,
        enabledCapabilities,
        isConfigured
    };
}
/**
 * Securely store or rotate provider credentials with AES-256-GCM encryption & SSRF validation
 */
function saveProviderConfig(input) {
    const providerKey = (input.provider_key || 'monnify').trim().toLowerCase();
    const environment = input.environment === 'live' ? 'live' : 'sandbox';
    const baseUrl = environment === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com';
    // 1. SSRF Guard on target endpoint
    const allowedHosts = providerInterface_js_1.WHITELISTED_PROVIDER_HOSTS[providerKey] || ['sandbox.monnify.com', 'api.monnify.com'];
    const ssrfCheck = (0, providerInterface_js_1.validateOutboundUrl)(baseUrl, allowedHosts);
    if (!ssrfCheck.valid) {
        return { success: false, error: `SSRF Violation: ${ssrfCheck.error}` };
    }
    const existing = (0, db_js_1.dbFetchOne)('verification_provider_configs', { provider_key: providerKey });
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let apiKeyEncrypted = existing?.api_key_encrypted || null;
    let secretKeyEncrypted = existing?.secret_key_encrypted || null;
    let apiKeyMasked = existing?.api_key_masked || null;
    let credentialsRotated = false;
    // 2. Encrypt and mask API key if provided
    if (input.api_key && input.api_key.trim().length > 0) {
        const rawKey = input.api_key.trim();
        apiKeyEncrypted = (0, securityService_js_1.encryptSecret)(rawKey);
        apiKeyMasked = (0, securityService_js_1.maskApiKey)(rawKey);
        credentialsRotated = true;
    }
    // 3. Encrypt secret key if provided
    if (input.secret_key && input.secret_key.trim().length > 0) {
        const rawSecret = input.secret_key.trim();
        secretKeyEncrypted = (0, securityService_js_1.encryptSecret)(rawSecret);
        credentialsRotated = true;
    }
    const contractCode = input.contract_code !== undefined ? (input.contract_code || '').trim() : (existing?.contract_code || null);
    const capabilities = input.enabled_capabilities || ['account_enquiry'];
    const capabilitiesJson = JSON.stringify(capabilities);
    // Determine initial status
    let status = existing?.status || 'not_configured';
    if (apiKeyEncrypted && secretKeyEncrypted) {
        if (status === 'not_configured')
            status = 'active';
    }
    else {
        status = 'not_configured';
    }
    if (existing) {
        (0, db_js_1.dbUpdate)('verification_provider_configs', {
            environment,
            base_url: baseUrl,
            api_key_encrypted: apiKeyEncrypted,
            secret_key_encrypted: secretKeyEncrypted,
            api_key_masked: apiKeyMasked,
            contract_code: contractCode,
            enabled_capabilities_json: capabilitiesJson,
            status,
            updated_by_admin_id: input.admin_id || null,
            updated_at: now
        }, { id: existing.id });
    }
    else {
        (0, db_js_1.dbInsert)('verification_provider_configs', {
            provider_key: providerKey,
            display_name: 'Monnify Verification Services',
            environment,
            base_url: baseUrl,
            api_key_encrypted: apiKeyEncrypted,
            secret_key_encrypted: secretKeyEncrypted,
            api_key_masked: apiKeyMasked,
            contract_code: contractCode,
            enabled_capabilities_json: capabilitiesJson,
            status,
            created_by_admin_id: input.admin_id || null,
            updated_by_admin_id: input.admin_id || null,
            created_at: now,
            updated_at: now
        });
    }
    // 4. Log rotation audit event
    (0, securityService_js_1.logSecurityAudit)({
        actor_type: 'super_admin',
        actor_id: input.admin_id || null,
        action: credentialsRotated ? `Rotate ${providerKey.toUpperCase()} Credentials` : `Update ${providerKey.toUpperCase()} Configuration`,
        target_type: 'verification_provider_configs',
        target_id: existing?.id || 1,
        reason: `Environment set to ${environment}, capabilities: [${capabilities.join(', ')}]`,
        ip_address: input.ip_address || null
    });
    return { success: true };
}
/**
 * Record test connection diagnostic result
 */
function recordProviderTestResult(params) {
    const existing = (0, db_js_1.dbFetchOne)('verification_provider_configs', { provider_key: params.provider_key });
    if (!existing)
        return;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    (0, db_js_1.dbUpdate)('verification_provider_configs', {
        status: params.result,
        last_tested_at: now,
        last_test_result: params.result_code,
        last_test_error: params.error_message || null,
        updated_at: now
    }, { id: existing.id });
}
/**
 * Log outbound API call in integration_events table
 */
function logIntegrationEvent(params) {
    try {
        (0, db_js_1.dbInsert)('integration_events', {
            provider: params.provider,
            endpoint: params.endpoint,
            request_method: params.request_method || 'GET',
            status_code: params.status_code || null,
            duration_ms: params.duration_ms || null,
            result: params.result,
            error_code: params.error_code || params.error_message || null,
            correlation_id: params.correlation_id || `INT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        });
    }
    catch (e) {
        console.error('logIntegrationEvent error:', e);
    }
}
