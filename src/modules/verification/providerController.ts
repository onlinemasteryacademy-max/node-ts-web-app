import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbFetchAll } from '../../db/db.js';
import { ENV } from '../../config/env.js';
import { getAdminUser, hasAdminPermission, logAdminAction } from '../admin/adminHelpers.js';
import { applyAdminSecurityHeaders } from '../admin/adminSecurity.js';
import {
  getProviderConfig,
  getDecryptedCredentials,
  saveProviderConfig,
  recordProviderTestResult,
  logIntegrationEvent
} from './credentialVault.js';
import { validateOutboundUrl, WHITELISTED_PROVIDER_HOSTS } from './providerInterface.js';

export async function providerRoutes(fastify: FastifyInstance) {
  const secretAdminPrefix = '/' + ENV.ADMIN_SECRET_PATH;

  // Apply Strict Admin Security Headers
  fastify.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith(`${secretAdminPrefix}/security/integrations`) ||
      request.url.startsWith('/api/admin/security/integrations')
    ) {
      applyAdminSecurityHeaders(reply);
    }
  });

  /**
   * Permission Guard for Integrations
   */
  const requireIntegrationAdmin = (request: FastifyRequest, reply: FastifyReply): number | null => {
    const adminId = (request.session as any)?.admin_id;
    if (!adminId) {
      if (request.url.startsWith('/api/')) {
        reply.code(401).send({ success: false, error: 'Unauthorized: Admin authentication required' });
      } else {
        reply.redirect(`${secretAdminPrefix}/login`);
      }
      return null;
    }

    const admin = getAdminUser(adminId);
    if (!admin) {
      (request.session as any).admin_id = null;
      if (request.url.startsWith('/api/')) {
        reply.code(401).send({ success: false, error: 'Unauthorized: Admin account revoked' });
      } else {
        reply.redirect(`${secretAdminPrefix}/login`);
      }
      return null;
    }

    const canAccess =
      hasAdminPermission('manage_security', adminId) ||
      hasAdminPermission('manage_integrations', adminId) ||
      hasAdminPermission('*', adminId);

    if (!canAccess) {
      if (request.url.startsWith('/api/')) {
        reply.code(403).send({ success: false, error: 'Access denied: Requires Integrations or Trust permission' });
      } else {
        reply.code(403).send('Forbidden: Insufficient permissions');
      }
      return null;
    }

    return Number(adminId);
  };

  /**
   * GET /${ENV.ADMIN_SECRET_PATH}/security/integrations
   * Monnify & Verification Integrations Management Page
   */
  fastify.get(`${secretAdminPrefix}/security/integrations`, async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = requireIntegrationAdmin(request, reply);
    if (!adminId) return;

    const currentAdmin = getAdminUser(adminId);
    const monnifyConfig = getProviderConfig('monnify') || {
      provider_key: 'monnify',
      display_name: 'Monnify Verification Services',
      environment: 'sandbox',
      base_url: 'https://sandbox.monnify.com',
      api_key_masked: 'Not configured',
      contract_code: '',
      enabled_capabilities: ['account_enquiry'],
      status: 'not_configured'
    };

    const recentEvents = dbFetchAll<any>('integration_events', { provider: 'monnify' }, 'id DESC', 20);

    return reply.view('admin/security/integrations.ejs', {
      title: 'Identity Verification Settings - Zlik Console',
      adminPath: ENV.ADMIN_SECRET_PATH,
      currentAdmin,
      config: monnifyConfig,
      recentEvents
    });
  });

  /**
   * POST /api/admin/security/integrations/save
   * Save/Rotate Monnify Configuration (AES-256-GCM Encrypted)
   */
  fastify.post('/api/admin/security/integrations/save', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = requireIntegrationAdmin(request, reply);
    if (!adminId) return;

    const body = (request.body as any) || {};
    const { environment, api_key, secret_key, contract_code, enabled_capabilities } = body;

    let capabilities: string[] = ['account_enquiry'];
    if (Array.isArray(enabled_capabilities)) {
      capabilities = enabled_capabilities;
    } else if (typeof enabled_capabilities === 'string') {
      try {
        capabilities = JSON.parse(enabled_capabilities);
      } catch (e) {
        capabilities = [enabled_capabilities];
      }
    }

    const saveResult = saveProviderConfig({
      provider_key: 'monnify',
      environment: environment === 'live' ? 'live' : 'sandbox',
      api_key: api_key || undefined,
      secret_key: secret_key || undefined,
      contract_code: contract_code || undefined,
      enabled_capabilities: capabilities,
      admin_id: adminId,
      ip_address: request.ip
    });

    if (!saveResult.success) {
      return reply.code(400).send({ success: false, error: saveResult.error });
    }

    logAdminAction(
      adminId,
      'Saved Monnify credentials',
      'verification_provider_configs',
      1,
      `Environment: ${environment || 'sandbox'}, capabilities: [${capabilities.join(', ')}]`,
      request.ip
    );

    return reply.send({
      success: true,
      message: 'Monnify configuration and encrypted credentials updated successfully.'
    });
  });

  /**
   * POST /api/admin/security/integrations/test
   * Test Connection to Monnify API (with SSRF Guard & Token Handshake)
   */
  fastify.post('/api/admin/security/integrations/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = requireIntegrationAdmin(request, reply);
    if (!adminId) return;

    const credentials = getDecryptedCredentials('monnify');
    if (!credentials.isConfigured) {
      return reply.code(400).send({
        success: false,
        error: 'Monnify API Key and Secret Key are required before testing connection.'
      });
    }

    // SSRF Check on Base URL
    const ssrfCheck = validateOutboundUrl(credentials.baseUrl, WHITELISTED_PROVIDER_HOSTS.monnify);
    if (!ssrfCheck.valid) {
      return reply.code(400).send({
        success: false,
        error: `Security Violation: ${ssrfCheck.error}`
      });
    }

    const startTime = Date.now();
    const loginEndpoint = `${credentials.baseUrl}/api/v1/auth/login`;

    try {
      // Monnify Auth login requires Basic Auth base64(apiKey:secretKey)
      const basicAuth = Buffer.from(`${credentials.apiKey}:${credentials.secretKey}`).toString('base64');

      const response = await fetch(loginEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      const latencyMs = Date.now() - startTime;
      const data: any = await response.json().catch(() => ({}));

      const isSuccess = response.ok && data?.requestSuccessful === true;

      logIntegrationEvent({
        provider: 'monnify',
        endpoint: '/api/v1/auth/login',
        request_method: 'POST',
        status_code: response.status,
        duration_ms: latencyMs,
        result: isSuccess ? 'success' : 'failure',
        error_message: isSuccess ? null : (data?.responseMessage || `HTTP ${response.status}`),
        redacted_request: { authType: 'Basic', environment: credentials.environment },
        redacted_response: {
          requestSuccessful: data?.requestSuccessful,
          responseMessage: data?.responseMessage,
          responseCode: data?.responseCode,
          hasToken: Boolean(data?.responseBody?.accessToken)
        }
      });

      if (isSuccess) {
        recordProviderTestResult({
          provider_key: 'monnify',
          result: 'active',
          result_code: 'AUTH_SUCCESS'
        });

        return reply.send({
          success: true,
          latencyMs,
          message: `Connected successfully to Monnify ${credentials.environment.toUpperCase()} in ${latencyMs}ms. Token authentication verified.`,
          environment: credentials.environment
        });
      } else {
        const errorMsg = data?.responseMessage || `Authentication rejected (HTTP ${response.status})`;
        recordProviderTestResult({
          provider_key: 'monnify',
          result: 'error',
          result_code: 'AUTH_REJECTED',
          error_message: errorMsg
        });

        return reply.code(400).send({
          success: false,
          latencyMs,
          error: errorMsg,
          environment: credentials.environment
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err.name === 'TimeoutError' ? 'Connection timed out after 10 seconds' : (err.message || 'Network error');

      logIntegrationEvent({
        provider: 'monnify',
        endpoint: '/api/v1/auth/login',
        request_method: 'POST',
        status_code: null,
        duration_ms: latencyMs,
        result: 'failure',
        error_message: errorMsg,
        redacted_request: { authType: 'Basic', environment: credentials.environment }
      });

      recordProviderTestResult({
        provider_key: 'monnify',
        result: 'error',
        result_code: 'NETWORK_ERROR',
        error_message: errorMsg
      });

      return reply.code(502).send({
        success: false,
        latencyMs,
        error: `Failed to reach Monnify: ${errorMsg}`,
        environment: credentials.environment
      });
    }
  });
}
