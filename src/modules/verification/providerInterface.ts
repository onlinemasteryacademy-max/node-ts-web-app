import { URL } from 'node:url';

/**
 * Standard Whitelisted Hosts for Identity & Bank Verification
 */
export const WHITELISTED_PROVIDER_HOSTS: Record<string, string[]> = {
  monnify: ['sandbox.monnify.com', 'api.monnify.com'],
  paystack: ['api.paystack.co']
};

/**
 * Server-Side Request Forgery (SSRF) Guard
 * Strictly verifies that outbound requests target safe, whitelisted, public HTTPS endpoints.
 */
export function validateOutboundUrl(targetUrl: string, allowedHosts: string[] = ['sandbox.monnify.com', 'api.monnify.com']): { valid: boolean; error?: string } {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { valid: false, error: 'Target URL is missing or invalid' };
  }

  try {
    const parsed = new URL(targetUrl.trim());

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

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return { valid: false, error: `Internal hostnames are blocked to prevent SSRF.` };
    }

    // 4. Strict Whitelist Check
    const isWhitelisted = allowedHosts.some(allowed => hostname === allowed.toLowerCase());
    if (!isWhitelisted) {
      return { valid: false, error: `Host '${hostname}' is not in the approved provider whitelist [${allowedHosts.join(', ')}].` };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Malformed URL: ${err.message || 'Unable to parse'}` };
  }
}

/**
 * Provider Configuration Contract
 */
export interface ProviderConfig {
  id?: number;
  provider_key: string;
  display_name: string;
  environment: 'sandbox' | 'live' | 'production';
  base_url: string;
  api_key_masked?: string;
  api_key?: string;
  secret_key?: string;
  contract_code?: string;
  enabled_capabilities: string[];
  status: 'not_configured' | 'active' | 'degraded' | 'error';
  last_tested_at?: string | null;
  last_test_result?: string | null;
  last_test_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Bank Account Resolution Result
 */
export interface BankAccountValidationResult {
  success: boolean;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
  providerReference?: string;
  error?: string;
  rawResponse?: any;
}

/**
 * Identity Verification Payload (BVN / NIN)
 */
export interface IdentityVerificationPayload {
  bvn?: string;
  nin?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
}

/**
 * Identity Verification Result
 */
export interface IdentityVerificationResult {
  success: boolean;
  matchScore: number;
  status: 'verified' | 'failed' | 'manual_review' | 'unsupported';
  providerReference?: string;
  resultCode?: string;
  failureReason?: string;
  redactedMetadata?: Record<string, any>;
}

/**
 * Business Registration Verification Payload
 */
export interface BusinessVerificationPayload {
  rcNumber: string;
  companyName: string;
  companyType?: string;
}

/**
 * Business Verification Result
 */
export interface BusinessVerificationResult {
  success: boolean;
  registeredName?: string;
  registrationNumber?: string;
  status: 'verified' | 'failed' | 'manual_review' | 'unsupported';
  failureReason?: string;
  redactedMetadata?: Record<string, any>;
}

/**
 * Connection Health Check Result
 */
export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  environment: string;
  message: string;
  error?: string;
  capabilitiesSupported?: string[];
}

/**
 * Pluggable Verification Provider Interface
 */
export interface IVerificationProvider {
  readonly providerKey: string;
  readonly displayName: string;

  validateConfiguration(config: Partial<ProviderConfig>): { valid: boolean; errors?: string[] };

  testConnection(credentials: {
    apiKey: string;
    secretKey: string;
    baseUrl: string;
    environment: string;
    contractCode?: string;
  }): Promise<TestConnectionResult>;

  verifyBankAccount(
    accountNumber: string,
    bankCode: string,
    credentials: {
      apiKey: string;
      secretKey: string;
      baseUrl: string;
      environment?: string;
    }
  ): Promise<BankAccountValidationResult>;

  verifyIdentity(
    payload: IdentityVerificationPayload,
    credentials: {
      apiKey: string;
      secretKey: string;
      baseUrl: string;
      environment: string;
    }
  ): Promise<IdentityVerificationResult>;

  verifyBusiness(
    payload: BusinessVerificationPayload,
    credentials: {
      apiKey: string;
      secretKey: string;
      baseUrl: string;
      environment: string;
    }
  ): Promise<BusinessVerificationResult>;
}
