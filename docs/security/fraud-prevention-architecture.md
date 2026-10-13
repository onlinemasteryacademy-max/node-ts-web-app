# Zlik — Fraud Prevention, Seller Verification and Trust Architecture

## 1. Executive Summary & Business Context

Zlik is an e-commerce storefront platform serving businesses and individual sellers in Nigeria. 
In Zlik's core transaction model:
- Customers transfer funds directly to sellers via bank transfer using displayed bank account details.
- Zlik **does not hold customer funds**, operate an escrow service, or automatically settle or reverse bank transactions.
- Sellers manually confirm receipt of payments and update order fulfillment statuses.
- Because customer funds move peer-to-peer outside of an automated gateway, **the platform's integrity rests entirely on verified seller accountability, impersonation defense, and transparent risk disclosures.**

This document defines the architectural blueprint for the complete Fraud Prevention, Seller Verification, Identity Management, and Trust System for Zlik.

---

## 2. Core Architecture Principles

1. **Every Seller Accountable**: Every storefront must be anchored to an authenticated, verified legal individual or registered corporate entity.
2. **Clear Separation of Seller Personas**: 
   - **Personal Sellers**: Verified legal individuals doing business under personal identity or trade style, without claiming corporate legal status.
   - **Registered Business Sellers**: Formally registered corporate/business entities verified through registration documentation and corporate bank account validation.
3. **No Phantom Approvals**: No seller may be approved on unverified claims, timeout fallbacks, or loose name similarities. Failures must default to restricted states (`pending` or `manual_review`).
4. **Server-Side Storefront Gating**: Unverified sellers may configure and preview draft stores, but are strictly prohibited from publishing active payment instructions or accepting customer orders until verification passes.
5. **Dynamic, Configurable Provider Architecture**: Monnify serves as the primary verification provider. The Super Admin must be able to configure, rotate, test, and monitor verification integrations without redeploying code.
6. **Data Minimization & NDPA Compliance**: Sensitive identifiers (BVN, NIN) are never stored in raw text, never logged, and masked wherever stored or rendered. Full account numbers are encrypted at rest with AES-256-GCM.
7. **Explainable Risk Intelligence**: Fraud scoring is rule-based and transparent with reason codes. Automated blocks trigger proportionate interventions without irreversible "black box" decisions.

---

## 3. High-Level System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                      ZLIK CORE PLATFORM                                            |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ PUBLIC STOREFRONT / CHECKOUT ]                   [ MERCHANT PORTAL ]                            |
|    - Verified Seller Badge                           - Personal / Business Onboarding              |
|    - Bank Account Match Indicator                    - Identity Verification Consent               |
|    - Direct Transfer Safety Notice                   - Payout Bank Account Validation              |
|    - Report Storefront Action                        - Protected Bank Change Workflow              |
|    - Order Gating Enforcement                        - Impersonation & Dispute Appeals             |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
                                      |                                   |
                                      v                                   v
+----------------------------------------------------------------------------------------------------+
|                               SECURITY & TRUST SERVICE LAYER                                       |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  +------------------------+  +--------------------------+  +------------------------------------+  |
|  | Verification Manager   |  | Storefront Gatekeeper    |  | Fraud & Risk Engine                |  |
|  | - Status Lifecycle     |  | - Order Blocking         |  | - Risk Signals & Scoring           |  |
|  | - Name Matching Engine |  | - Bank Instruction Lock  |  | - Velocity Checks                  |  |
|  | - Document Validation  |  | - Bank Change Protection |  | - Impersonation Scanner            |  |
|  +------------------------+  +--------------------------+  +------------------------------------+  |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | Provider Adapter Interface (IVerificationProvider)                                           |  |
|  |  - validateConfig()   - testConnection()    - verifyIdentity()                               |  |
|  |  - verifyBankAccount()- verifyBusiness()    - normalizeResponse()                            |  |
|  +----------------------------------------------------------------------------------------------+  |
|             |                                                                                      |
|             v                                                                                      |
|  +-----------------------+   +-----------------------+                                             |
|  | MonnifyAdapter        |   | Future Providers      |                                             |
|  | - OAuth2 Token Cache  |   | (SmileID, Youverify,  |                                             |
|  | - Rate Limiter        |   |  Prembly, etc.)       |                                             |
|  | - SSRF Guard          |   |                       |                                             |
|  +-----------------------+   +-----------------------+                                             |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------------------------+
|                               SUPER ADMIN SECURITY & TRUST CONSOLE                                 |
+----------------------------------------------------------------------------------------------------+
|  - Security & Trust Overview Metrics                                                               |
|  - Verification Queue (Filter by Type, Status, Risk Level)                                         |
|  - Seller Investigation Console (Timeline, Linked Accounts, Bank History, Orders)                 |
|  - Verification Provider Settings (Monnify Sandbox & Production Credential Vault)                  |
|  - Fraud Reports & Dispute Case Management (Triage, Actions, Audit Trail)                          |
+----------------------------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------------------------+
|                               PERSISTENT DATA STORE (SQLite + MySQL)                               |
+----------------------------------------------------------------------------------------------------+
|  - seller_profiles             - seller_verifications       - business_profiles                    |
|  - seller_bank_accounts        - verification_provider_configs                                     |
|  - fraud_reports               - fraud_case_events          - risk_events                          |
|  - security_audit_logs         - integration_events                                                |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Key Subsystem Specifications

### 4.1 Verification Lifecycle & States
The system maintains distinct verification lifecycles for:
1. `personal_identity` (NIN, BVN match)
2. `bank_account` (account name enquiry + name matching)
3. `business_registration` (RC/BN number, CAC registry/authoritative validation)

Each verification object transitions through strict, non-ambiguous states:
- `not_started`: Initial state upon seller registration.
- `pending`: Submission received, awaiting provider dispatch or manual queue.
- `in_progress`: Dispatched to Monnify or external verification service.
- `verified`: Authoritative verification passed and cryptographic evidence recorded.
- `failed`: Validation failed with a recorded `result_code` and seller-safe message.
- `manual_review`: Inconclusive outcome, minor typographical variance, or high-risk signal.
- `expired`: Document or verification validity period elapsed.
- `revoked`: Post-verification revocation following a verified complaint or policy violation.

### 4.2 Name Matching Engine
Direct bank transfers require reliable name correspondence without excessive false rejections from minor formatting differences.
- Normalizes case, removes honorifics (Mr, Mrs, Chief, Alhaji, Dr, Engr).
- Strips punctuation and extraneous spacing.
- Performs exact token-set comparison (handling order inversion, e.g., "Adeyemi Babatunde" vs "Babatunde Adeyemi").
- Calculates Jaro-Winkler similarity score with a strict threshold ($\ge 0.88$ for acceptable match, $0.75 - 0.87$ triggers `manual_review`, $< 0.75$ triggers `failed`).
- For registered businesses: compares against registered business name or approved legal trade style.

### 4.3 Secure Credential Vault & Monnify Adapter
- Monnify credentials (API Key, Secret Key) are encrypted at rest using AES-256-GCM with a secret key derived from `ENV.ENCRYPTION_KEY`.
- The Super Admin configuration screen allows seamless switching between `sandbox` and `production` environments with isolated credentials.
- All outbound requests pass through an SSRF guard that enforces HTTPS and strictly validates the hostname against approved Monnify domains (`sandbox.monnify.com` and `api.monnify.com`).
- OAuth Bearer tokens (`accessToken`) are cached in memory with a safety margin (refreshing at 50 minutes of the 60-minute expiry).

### 4.4 Storefront Gating & Access Control
- Store creation and catalog editing are unrestricted in draft mode.
- Store publishing, active bank instruction rendering, and customer order placement require:
  - For Personal Sellers: `personal_identity == 'verified'` AND `bank_account == 'verified'`.
  - For Registered Businesses: `business_registration == 'verified'` AND `bank_account == 'verified'`.
- Attempts to place an order on an unverified store are rejected server-side with an informative, user-friendly notice.

### 4.5 Payout Bank Account Protection
- Changes to payout bank details require:
  1. Active authenticated merchant session.
  2. 6-digit email OTP verification.
  3. Real-time account name enquiry via Monnify.
  4. Algorithmic name matching against the verified seller profile.
  5. The store enters a protected `bank_pending` status until the new account is verified; during this time, payment instructions default to the existing verified account or are safely paused.
  6. Email notifications are dispatched immediately to the merchant.

### 4.6 Fraud Detection & Impersonation Engine
- Evaluates risk vectors:
  - Account velocity (multiple stores created in short intervals).
  - Impersonation heuristics (store name similarity to established brands or existing verified stores).
  - Suspicious bank reuse (same bank account attempted across different unlinked merchant profiles).
  - Spike in non-delivery reports or customer disputes.
- Produces risk levels: `low`, `medium`, `high`, `critical`.
- Generates transparent, auditable reason codes (`SUSPICIOUS_BANK_REUSE`, `BRAND_IMPERSONATION_SIMILARITY`, `EXCESSIVE_DISPUTE_RATE`).

### 4.7 Super Admin Security & Trust Console
A dedicated administrative workspace located under `/${ENV.ADMIN_SECRET_PATH}/security` containing:
- **Security Overview**: Real-time aggregated statistics (verified sellers, pending reviews, flagged stores, dispute volumes).
- **Verification Queue**: Filterable list of pending personal and business identity reviews.
- **Seller Investigation View**: Unified 360-degree timeline of a seller's verifications, linked bank accounts, order volume, dispute history, and audit log.
- **Verification Integrations**: Monnify configuration vault, connection test tools, and health indicators.
- **Dispute & Fraud Case Management**: Structured dispute ticket management with action triggers (temporary order hold, storefront suspension, re-verification prompt).

---

## 5. Security & Privacy Compliance (NDPA 2023)
- In accordance with the Nigeria Data Protection Act (NDPA 2023):
  - Sellers provide explicit, granular consent prior to identity verification.
  - Raw national identity numbers (BVN, NIN) are processed in-flight and not stored in plaintext. Masked representations (e.g., `2222****890`) and Monnify transaction reference IDs are retained.
  - Bank account numbers are stored encrypted at rest (`account_number_encrypted`) and rendered masked (`account_number_masked`).
  - Full audit logging records every administrative action, verification event, and status override with actor ID and timestamp.
