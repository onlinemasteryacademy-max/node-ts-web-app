# Zlik — Security Threat Model & Risk Analysis

## 1. Scope & System Boundaries

This threat model analyzes the security posture of Zlik's e-commerce storefront platform, with specific focus on **peer-to-peer customer-to-seller direct bank transfers**, seller identity verification, Monnify third-party integration, payout bank protection, and storefront brand governance.

### In-Scope Assets
1. **Customer Funds & Trust**: Protection against paying fraudulent sellers via direct transfer.
2. **Merchant Accounts & Payout Details**: Integrity of bank accounts designated to receive customer payments.
3. **Identity & KYC Data**: Confidentiality of seller verification records (BVN, NIN, National ID, CAC registration).
4. **Integration Credentials**: Confidentiality and integrity of Monnify API keys, secrets, and bearer tokens.
5. **Brand & Storefront Identity**: Protection against unauthorized cloning of brands, trademarks, or registered businesses.
6. **Platform Audit Trail**: Integrity and tamper-resistance of administrative and security event logs.

---

## 2. Threat Actors & Attacker Profiles

| Actor Profile | Motivation | Capabilities | Target |
|---|---|---|---|
| **Ghost Merchant / Scam Seller** | Financial gain | Moderate; creates bogus stores, copies legitimate product images, provides own bank details | Shoppers sending direct bank transfers |
| **Brand Impersonator / Phisher** | High financial gain; deception | Sophisticated; clones known brands (e.g. Nike, Zara, local Instagram brands) with similar names | Shoppers and established merchant reputations |
| **Account Hijacker (ATO)** | Financial diversion | High; credential stuffing, session theft, phishing seller passwords | Established merchant payout bank account details |
| **Repeat Offender / Banned Seller** | Evasion | Moderate; creates new accounts with altered personal details, friends' bank accounts | Platform bans and restrictions |
| **Unscrupulous Competitor** | Sabotage, extortion | Moderate; submits malicious fraud reports, fake dispute tickets, or trademark squatted claims | Competitor storefronts |
| **Malicious Admin / Insider** | Unauthorized access, fraud collusion | High; privileged database or console access | Verification status overrides, credential theft |

---

## 3. STRIDE Threat Analysis & Mitigation Matrix

### 3.1 Spoofing Identity

#### Threat: Storefront Impersonation & Cloned Brands
- **Description**: An attacker registers `zlik.store/official-nike-ng` or clones a well-known Nigerian Instagram fashion brand's name, logo, and photos to deceive customers into transferring funds to a personal bank account.
- **Impact**: Severe customer loss; reputational damage to Zlik and the legitimate brand.
- **Mitigations**:
  - Storefront Naming Validator: Prohibits reserved brand terms, company suffixes (`Ltd`, `Plc`, `LLC`, `Nigeria`, `Official`) for unverified or personal sellers.
  - Levenshtein / Jaro-Winkler string similarity check against verified merchants and known high-risk brand lists.
  - Verification Badge Distinction: Distinct, non-forgeable badges indicating *Verified Individual Seller* vs *Verified Registered Business*.
  - Brand Protection Action: 1-click reporting modal on every public storefront with priority triage for impersonation claims.

#### Threat: Forged Verification Callbacks / Webhook Spoofing
- **Description**: An attacker attempts to submit fake verification confirmations to internal endpoints or spoof Monnify callbacks.
- **Impact**: Fraudulent seller granted verified status without legitimate KYC.
- **Mitigations**:
  - Monnify verification is driven **server-to-server** via authenticated outbound API calls with cryptographic token exchange.
  - If webhooks are utilized, strict HMAC-SHA512 signature verification using `requestBody` and the secret key is enforced.
  - Unsigned, client-side, or unauthenticated verification callbacks are rejected.

---

### 3.2 Tampering with Data

#### Threat: Bank Account Number Swap (Payment Diversion)
- **Description**: An attacker gains access to a legitimate seller's session or API and modifies `bank_account_number` to direct buyer funds to the attacker's account.
- **Impact**: Immediate loss of revenue for legitimate seller; customer transfers diverted to fraudster.
- **Mitigations**:
  - Two-Step Bank Account Protection:
    1. Active session re-authentication.
    2. Out-of-band 6-digit email OTP dispatch with 5-minute expiry.
    3. Mandatory Monnify account name resolution.
    4. Algorithmic name-match enforcement against the seller's verified identity.
  - Immediate security alert email dispatched to the merchant's registered address.
  - Payout changes place the storefront into `bank_pending` state, preventing unverified accounts from accepting customer payments.

#### Threat: In-Flight Request Tampering / Parameter Pollution
- **Description**: Manipulating HTTP requests to change verification statuses, prices, or store ownership.
- **Impact**: Privilege escalation or unauthorized approval.
- **Mitigations**:
  - All verification status updates occur through strict server-side state machines; client payload fields such as `is_verified` or `verification_status` are rejected if present in merchant update requests.
  - Database updates execute through parameterized queries (`node:sqlite` and `mysql2`).

---

### 3.3 Repudiation

#### Threat: Seller Denies Receiving Payment / Ghost Delivery
- **Description**: Seller accepts customer bank transfer, claims non-receipt, and refuses to dispatch goods.
- **Impact**: Customer loses money; dispute escalates without clear transaction trace.
- **Mitigations**:
  - Public Storefront Direct Transfer Warning: Clear modal notice on checkout reminding buyers of the lack of automated escrow.
  - Payment Claim Evidence: Customer uploads bank transfer screenshot or input transaction reference (`payment_claims` table with timestamp and IP).
  - Seller Accountability: Seller identity is authoritatively tied to verified NIN/BVN or CAC registration.
  - Repeat Dispute Throttling: If a seller receives $\ge 2$ unpaid non-delivery disputes, the store is automatically flagged for review and high-value orders are gated.

---

### 3.4 Information Disclosure

#### Threat: Leakage of National Identifiers (BVN / NIN)
- **Description**: Exposure of raw BVN or NIN in logs, error traces, API responses, or database backups.
- **Impact**: Severe privacy violation, identity theft, NDPA regulatory penalties.
- **Mitigations**:
  - Zero Plaintext Storage: Raw BVN/NIN are only held in memory for the duration of the outbound Monnify API call.
  - Data Masking: Stored representations are masked (`2222******890`) and linked via provider transaction references.
  - Redaction: Error handlers and logging interceptors automatically redact 11-digit numbers and authentication tokens from console output and log files.

#### Threat: Monnify API Credential Leakage
- **Description**: Monnify API Key or Secret Key exposed in git repository, frontend bundles, or client responses.
- **Impact**: Attacker consumes Monnify verification quota, queries identity databases, or tampers with integrations.
- **Mitigations**:
  - Integration credentials stored encrypted at rest with AES-256-GCM.
  - Super Admin API endpoints return masked credentials (e.g., `MK_TEST_••••••••1234`).
  - Zero client-side transmission: Monnify authentication is strictly backend-to-backend.

---

### 3.5 Denial of Service

#### Threat: Verification Quota Exhaustion / API Bombing
- **Description**: Malicious actor submits thousands of fake verification requests, incurring significant Monnify API usage fees or exhausting rate limits.
- **Impact**: Financial loss for Zlik; disruption of verification for legitimate sellers.
- **Mitigations**:
  - Rate limiting on verification endpoints: Max 3 verification attempts per seller per 24 hours without administrative reset.
  - IP-based rate limiting on public registration and verification endpoints.
  - Cooldown periods on failed checks.

---

### 3.6 Elevation of Privilege / SSRF

#### Threat: Server-Side Request Forgery (SSRF) via Integration Config
- **Description**: Super Admin or compromised account enters an internal URL (e.g., `http://169.254.169.254` or `http://localhost:3000`) into Monnify Base URL configuration to probe private infrastructure.
- **Impact**: Infrastructure compromise, cloud metadata leakage.
- **Mitigations**:
  - Strict Base URL Whitelisting: Only `https://sandbox.monnify.com` and `https://api.monnify.com` are accepted.
  - Loopback, link-local, private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and non-HTTPS protocols are explicitly blocked.

---

## 4. Residual Risk & Procedural Safeguards

| Threat Area | Residual Risk Level | Procedural Countermeasure |
|---|---|---|
| Mismatch Between Account Name & Store Name | Low | Mandatory manual review queue when name similarity is inconclusive. |
| Stolen Identity Documents Used During Onboarding | Low-Medium | Biometric face match integration planned for Phase 2; Monnify BVN details validation checks date of birth and phone. |
| Customer Paid Fraudulent Seller Outside Platform | Low | Prominent buyer warning on checkout screen explaining direct transfer mechanics. |
