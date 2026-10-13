# Zlik — Monnify Verification Integration Plan

## 1. Overview & Official Monnify Standards

Monnify is an enterprise payment and compliance technology provider licensed by the Central Bank of Nigeria (CBN). Zlik utilizes Monnify as the primary identity and bank-account verification partner.

This integration plan adheres to Monnify’s official developer documentation:
- Verification APIs: `https://developers.monnify.com/docs/verification-api`
- Account Resolution: `https://developers.monnify.com/docs/integration`
- Compliance & KYC: `https://developers.monnify.com/docs/integration-guide-bvn-nin-update`

---

## 2. API Endpoints & Environments

| Environment | Base URL | Purpose |
|---|---|---|
| **Sandbox** | `https://sandbox.monnify.com` | Safe testing, mock verification test cases, integration validation |
| **Production** | `https://api.monnify.com` | Authoritative live verification against CBN, NIBSS, and NIMC databases |

### Whitelisted Endpoints

1. **Authentication**: `POST /api/v1/auth/login`
2. **Account Name Enquiry**: `GET /api/v2/disbursements/account/validate?accountNumber={accountNumber}&bankCode={bankCode}`
3. **Supported Banks List**: `GET /api/v1/banks`
4. **BVN Details Matching**: `POST /api/v1/vas/bvn-details-match`
5. **BVN and Account Validation**: `POST /api/v1/vas/bvn-account-match`
6. **NIN Verification**: `POST /api/v1/vas/nin-details`

---

## 3. Authentication & Token Management

Monnify utilizes OAuth2 Bearer Tokens generated via Basic Authentication over HTTPS.

### 3.1 Login Handshake
- **Method**: `POST /api/v1/auth/login`
- **Headers**:
  ```http
  Authorization: Basic <base64(apiKey:secretKey)>
  Content-Type: application/json
  ```
- **Response**:
  ```json
  {
    "requestSuccessful": true,
    "responseMessage": "success",
    "responseCode": "0",
    "responseBody": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "expiresIn": 3600
    }
  }
  ```

### 3.2 Token Caching Strategy
- The `MonnifyAdapter` maintains an in-memory token cache:
  ```ts
  interface CachedToken {
    token: string;
    expiresAt: number; // Date.now() + (expiresIn - 300) * 1000
    environment: 'sandbox' | 'production';
  }
  ```
- Tokens are automatically refreshed **5 minutes before expiration** (at 3,300 seconds of the 3,600-second window).
- If an API request returns `401 Unauthorized`, the cached token is immediately invalidated, re-acquired, and the request retried once.

---

## 4. Verification Workflows

### 4.1 Bank Account Name Enquiry
- **Endpoint**: `GET /api/v2/disbursements/account/validate?accountNumber={acct}&bankCode={code}`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**:
  ```json
  {
    "requestSuccessful": true,
    "responseMessage": "success",
    "responseCode": "0",
    "responseBody": {
      "accountNumber": "0123456789",
      "accountName": "CHINEDU EZE ENTERPRISES",
      "bankCode": "058"
    }
  }
  ```
- **Error Handling**:
  - `Invalid account number`: Returns sanitized failure reason to seller.
  - `Bank temporarily unreachable`: Places request into `manual_review` or allows retry without blocking overall store draft.

### 4.2 BVN / NIN Verification
- Monnify’s identity endpoints validate user credentials against authoritative regulatory databases.
- **Critical Architectural Rule**: Monnify's BVN and NIN matching services are **restricted to Live mode** due to privacy regulations.
- In Sandbox mode:
  - The adapter supports designated mock test identifiers for automated integration verification.
  - If a requested service is not enabled on Zlik's Monnify profile, the adapter explicitly reports `UNSUPPORTED_CAPABILITY` or `SERVICE_NOT_ENABLED` rather than simulating false verification.

---

## 5. Extensible Provider Adapter Architecture

To insulate Zlik's core business logic from provider-specific formats, all verifications flow through the `IVerificationProvider` interface:

```typescript
export interface IVerificationProvider {
  readonly providerKey: string;
  readonly displayName: string;

  validateConfiguration(config: ProviderConfig): { valid: boolean; errors?: string[] };
  testConnection(config: ProviderConfig): Promise<{ success: boolean; latencyMs: number; error?: string }>;
  getCapabilities(config: ProviderConfig): Promise<ProviderCapabilities>;
  
  verifyBankAccount(
    accountNumber: string, 
    bankCode: string, 
    config: ProviderConfig
  ): Promise<BankAccountValidationResult>;

  verifyIdentity(
    payload: IdentityVerificationPayload, 
    config: ProviderConfig
  ): Promise<IdentityVerificationResult>;

  verifyBusiness(
    payload: BusinessVerificationPayload, 
    config: ProviderConfig
  ): Promise<BusinessVerificationResult>;
}
```

---

## 6. Security & Hardening Controls

### 6.1 Server-Side Request Forgery (SSRF) Prevention
- Outbound HTTP requests validate that the target hostname strictly equals:
  - `sandbox.monnify.com` (in sandbox mode)
  - `api.monnify.com` (in production mode)
- IP-based URLs, non-standard ports, and non-HTTPS protocols are rejected at the configuration layer.

### 6.2 Credential Encryption at Rest
- `api_key` and `secret_key` are encrypted using AES-256-GCM:
  ```ts
  function encryptSecret(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getDerivedEncryptionKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }
  ```
- Decryption occurs only in backend memory when executing an outbound Monnify call. Credentials are never written to disk unencrypted, logged, or sent to frontend clients.

### 6.3 Request Resiliency & Rate Limiting
- Outbound requests enforce a strict **10-second timeout**.
- Failed network requests trigger exponential backoff with jitter (max 2 retries).
- Detailed integration metrics (latency, status codes, outcome) are recorded in `integration_events` without sensitive payload data.
