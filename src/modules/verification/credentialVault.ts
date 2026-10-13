import { dbFetchOne, dbFetchAll, dbInsert, dbUpdate } from '../../db/db.js';
import { encryptSecret, decryptSecret, maskApiKey, logSecurityAudit } from '../security/securityService.js';
import { ProviderConfig, validateOutboundUrl, WHITELISTED_PROVIDER_HOSTS } from './providerInterface.js';

export interface SaveProviderConfigInput {
  provider_key: string;
  environment: 'sandbox' | 'live';
  api_key?: string;
  secret_key?: string;
  contract_code?: string;
  enabled_capabilities?: string[];
  admin_id?: number | null;
  ip_address?: string | null;
}

/**
 * Get sanitized provider configuration suitable for administrative UI display
 * (Never reveals raw unencrypted secrets)
 */
export function getProviderConfig(providerKey: string = 'monnify'): ProviderConfig | null {
  const row = dbFetchOne<any>('verification_provider_configs', { provider_key: providerKey });
  if (!row) return null;

  let enabledCapabilities: string[] = ['account_enquiry'];
  try {
    if (row.enabled_capabilities_json) {
      enabledCapabilities = JSON.parse(row.enabled_capabilities_json);
    }
  } catch (e) {}

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
export function getDecryptedCredentials(providerKey: string = 'monnify'): {
  apiKey: string;
  secretKey: string;
  contractCode: string;
  baseUrl: string;
  environment: 'sandbox' | 'live';
  enabledCapabilities: string[];
  isConfigured: boolean;
} {
  const row = dbFetchOne<any>('verification_provider_configs', { provider_key: providerKey });
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

  const apiKey = row.api_key_encrypted ? decryptSecret(row.api_key_encrypted) : '';
  const secretKey = row.secret_key_encrypted ? decryptSecret(row.secret_key_encrypted) : '';
  const contractCode = row.contract_code || '';
  const environment = (row.environment === 'live' || row.environment === 'production') ? 'live' : 'sandbox';
  const baseUrl = environment === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com';

  let enabledCapabilities: string[] = [];
  try {
    if (row.enabled_capabilities_json) {
      enabledCapabilities = JSON.parse(row.enabled_capabilities_json);
    }
  } catch (e) {}

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
export function saveProviderConfig(input: SaveProviderConfigInput): { success: boolean; error?: string } {
  const providerKey = (input.provider_key || 'monnify').trim().toLowerCase();
  const environment = input.environment === 'live' ? 'live' : 'sandbox';
  const baseUrl = environment === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com';

  // 1. SSRF Guard on target endpoint
  const allowedHosts = WHITELISTED_PROVIDER_HOSTS[providerKey] || ['sandbox.monnify.com', 'api.monnify.com'];
  const ssrfCheck = validateOutboundUrl(baseUrl, allowedHosts);
  if (!ssrfCheck.valid) {
    return { success: false, error: `SSRF Violation: ${ssrfCheck.error}` };
  }

  const existing = dbFetchOne<any>('verification_provider_configs', { provider_key: providerKey });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let apiKeyEncrypted = existing?.api_key_encrypted || null;
  let secretKeyEncrypted = existing?.secret_key_encrypted || null;
  let apiKeyMasked = existing?.api_key_masked || null;

  let credentialsRotated = false;

  // 2. Encrypt and mask API key if provided
  if (input.api_key && input.api_key.trim().length > 0) {
    const rawKey = input.api_key.trim();
    apiKeyEncrypted = encryptSecret(rawKey);
    apiKeyMasked = maskApiKey(rawKey);
    credentialsRotated = true;
  }

  // 3. Encrypt secret key if provided
  if (input.secret_key && input.secret_key.trim().length > 0) {
    const rawSecret = input.secret_key.trim();
    secretKeyEncrypted = encryptSecret(rawSecret);
    credentialsRotated = true;
  }

  const contractCode = input.contract_code !== undefined ? (input.contract_code || '').trim() : (existing?.contract_code || null);
  const capabilities = input.enabled_capabilities || ['account_enquiry'];
  const capabilitiesJson = JSON.stringify(capabilities);

  // Determine initial status
  let status = existing?.status || 'not_configured';
  if (apiKeyEncrypted && secretKeyEncrypted) {
    if (status === 'not_configured') status = 'active';
  } else {
    status = 'not_configured';
  }

  if (existing) {
    dbUpdate('verification_provider_configs', {
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
  } else {
    dbInsert('verification_provider_configs', {
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
  logSecurityAudit({
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
export function recordProviderTestResult(params: {
  provider_key: string;
  result: 'active' | 'degraded' | 'error';
  result_code: string;
  error_message?: string | null;
}): void {
  const existing = dbFetchOne<any>('verification_provider_configs', { provider_key: params.provider_key });
  if (!existing) return;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  dbUpdate('verification_provider_configs', {
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
export function logIntegrationEvent(params: {
  provider: string;
  endpoint: string;
  request_method: string;
  status_code?: number | null;
  duration_ms?: number | null;
  result: 'success' | 'failure' | 'timeout';
  error_code?: string | null;
  error_message?: string | null;
  correlation_id?: string | null;
  redacted_request?: any;
  redacted_response?: any;
}): void {
  try {
    dbInsert('integration_events', {
      provider: params.provider,
      endpoint: params.endpoint,
      request_method: params.request_method || 'GET',
      status_code: params.status_code || null,
      duration_ms: params.duration_ms || null,
      result: params.result,
      error_code: params.error_code || params.error_message || null,
      correlation_id: params.correlation_id || `INT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    });
  } catch (e) {
    console.error('logIntegrationEvent error:', e);
  }
}
