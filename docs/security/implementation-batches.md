# Zlik — Fraud Prevention & Seller Verification Implementation Batches

## Master Execution Roadmap

This document outlines the sequential implementation plan divided into 12 distinct, verifiable batches (Batch 0 through Batch 11).

---

## Batch Status Overview

- [x] **Batch 0 — Codebase Audit, Threat Modeling & Architecture Planning**
- [x] **Batch 1 — Security Foundations, Data Model & Migrations**
- [x] **Batch 2 — Super Admin Security & Trust Console**
- [x] **Batch 3 — Verification Provider Architecture & Credential Management**
- [x] **Batch 4 — Monnify Adapter & Identity Verification Engine**
- [ ] **Batch 5 — Bank Account Ownership Verification & Account Change Protection**
- [ ] **Batch 6 — Seller Onboarding & Storefront Gating Enforcement**
- [ ] **Batch 7 — Business Verification, Store Naming Rules & Brand Protection**
- [ ] **Batch 8 — Fraud Detection Engine & Dispute Case Management**
- [ ] **Batch 9 — Customer Trust Badges & Direct Transfer Safety Notices**
- [ ] **Batch 10 — Security Hardening, Edge Cases & Automated Test Suite**
- [ ] **Batch 11 — Production Readiness, Credential Rotation & Deployment Verification**

---

## Detailed Batch Specifications

### Batch 0: Codebase Audit, Threat Modeling & Architecture Planning
- **Objectives**: Inspect existing project, identify framework, database, persistence, and auth architectures. Produce comprehensive planning documents.
- **Dependencies**: None.
- **Files Created**:
  - `docs/security/fraud-prevention-architecture.md`
  - `docs/security/threat-model.md`
  - `docs/security/database-design.md`
  - `docs/security/monnify-integration-plan.md`
  - `docs/security/implementation-batches.md`
  - `docs/security/acceptance-criteria.md`
- **Exit Criteria**: All architectural boundaries, data models, Monnify integration paths, and security controls fully documented and approved.

---

### Batch 1: Security Foundations, Data Model & Migrations
- **Objectives**: Implement the 10 additive security tables in SQLite (`db.ts`) and MySQL (`mysql.ts`), register them in `persistence.ts`, and implement safe automatic backfilling of existing stores without data loss.
- **Dependencies**: Batch 0.
- **Files Modified/Created**:
  - `src/db/db.ts` (SQLite DDL & indexes)
  - `src/db/mysql.ts` (MySQL DDL & indexes)
  - `src/db/persistence.ts` (Registration in `PERSISTENCE_TABLES`)
  - `src/modules/security/securityService.ts` (Backfill & domain helpers)
- **Exit Criteria**:
  - Database boots cleanly; all 10 tables and indexes created.
  - Existing stores safely backfilled into `seller_profiles` and `seller_bank_accounts`.
  - Zero regression on existing stores, products, or orders.

---

### Batch 2: Super Admin Security & Trust Console
- **Objectives**: Build the administrative interface under `/${ENV.ADMIN_SECRET_PATH}/security`.
- **Dependencies**: Batch 1.
- **Components & Views**:
  - `src/views/admin/security/overview.ejs` (Live statistics, verified sellers, flagged stores)
  - `src/views/admin/security/queue.ejs` (Verification queue with status/type filters)
  - `src/views/admin/security/investigate.ejs` (Seller 360-degree timeline & risk profile)
  - `src/modules/admin/adminSecurityController.ts` (API routes and permissions)
- **Exit Criteria**:
  - Super Admin can navigate to Security & Trust console.
  - Metric queries execute against real database tables.
  - Access is strictly restricted to authenticated Super Admins with role guards.

---

### Batch 3: Verification Provider Architecture & Credential Management
- **Objectives**: Implement the provider interface `IVerificationProvider`, AES-256-GCM credential vault, sandbox/production environment switching, and SSRF prevention.
- **Dependencies**: Batch 2.
- **Files Created/Modified**:
  - `src/modules/verification/providerInterface.ts`
  - `src/modules/verification/credentialVault.ts`
  - `src/views/admin/security/integrations.ejs`
  - `src/modules/verification/providerController.ts`
- **Exit Criteria**:
  - Super Admin can enter, view masked, and rotate Monnify credentials.
  - Credentials are encrypted at rest with AES-256-GCM.
  - SSRF guard strictly blocks non-whitelisted hosts.

---

### Batch 4: Monnify Adapter & Identity Verification Engine
- **Objectives**: Implement the official Monnify adapter with OAuth2 token caching, retry logic with jitter, account resolution, and BVN/NIN verification.
- **Dependencies**: Batch 3.
- **Files Created/Modified**:
  - `src/modules/verification/monnifyAdapter.ts`
  - `src/modules/verification/verificationService.ts`
- **Exit Criteria**:
  - Test connection makes genuine server-side call and reports latency or diagnostic error.
  - Unsupported services report explicit status rather than false positive.
  - Integration events logged in `integration_events`.

---

### Batch 5: Bank Account Ownership Verification & Account Change Protection
- **Objectives**: Implement real-time bank resolution, name matching algorithms, verified account storage, and protected account change workflows.
- **Dependencies**: Batch 4.
- **Files Created/Modified**:
  - `src/modules/verification/nameMatcher.ts` (Token match, Jaro-Winkler)
  - `src/modules/verification/bankVerificationController.ts`
  - `src/views/merchant/settings.ejs` (Protected bank account section)
- **Exit Criteria**:
  - Seller bank account verified against Monnify enquiry.
  - Unmatched names rejected or flagged for manual review.
  - Changing payout bank requires 6-digit OTP and re-verification.

---

### Batch 6: Seller Onboarding & Storefront Gating Enforcement [COMPLETED]
- **Objectives**: Wire verification into seller onboarding and enforce server-side gating on storefront publishing, order placement, and active payment instructions.
- **Dependencies**: Batch 5.
- **Files Created/Modified**:
  - `src/views/merchant/verification.ejs`
  - `src/views/merchant/dashboard.ejs`
  - `src/modules/orders/ordersService.ts` (Server-side order gating)
  - `src/modules/security/securityService.ts` (`isStoreOrderGated`)
  - `src/modules/verification/verificationController.ts`
  - `src/views/store.ejs` & `src/views/checkout.ejs`
- **Exit Criteria**:
  - Unverified sellers can draft stores but cannot accept orders.
  - Orders placed against unverified stores are safely rejected with `is_gated: true`.
  - Gating status updates automatically when verification passes.
  - Test Suite 30 verified 100% pass rate.

---

### Batch 7: Business Verification, Store Naming Rules & Brand Protection [COMPLETED]
- **Objectives**: Implement registered-business verification (CAC registration, documents, representative relationship) and server-side storefront naming rules.
- **Dependencies**: Batch 6.
- **Files Created/Modified**:
  - `src/modules/verification/businessVerificationService.ts`
  - `src/utils/storeNameValidator.ts`
  - `src/modules/auth/authController.ts` (Store name validation on signup)
  - `src/server.ts` (Store name validation on merchant settings)
  - `src/views/merchant/verification.ejs` (CAC registration UI and submission)
  - `src/views/admin/security/investigate.ejs` (Admin CAC business approval/rejection)
- **Exit Criteria**:
  - Personal accounts prohibited from using false corporate terms (Ltd, Plc, Holdings, etc.).
  - Institutional & government authority terms (Bank, CBN, EFCC, Official Zlik) restricted.
  - Brand impersonation (Apple, Nike, Dangote, Jumia) and typo-squatting rejected.
  - Business accounts require verifiable CAC registration data (RC/BN format, unique check).
  - Cross-check representative name with seller verified legal identity.
  - Test Suite 31 verified 100% pass rate.

---

### Batch 8: Fraud Detection Engine & Dispute Case Management [COMPLETED]
- **Objectives**: Implement the explainable risk engine (velocity checks, bank reuse, dispute spikes) and Super Admin dispute case management.
- **Dependencies**: Batch 7.
- **Files Created/Modified**:
  - `src/modules/fraud/riskEngine.ts`
  - `src/modules/fraud/disputesController.ts`
  - `src/views/admin/security/disputes.ejs`
  - `src/views/admin/security/overview.ejs`
  - `src/server.ts`
- **Exit Criteria**:
  - Risk triggers produce explainable reason codes (BANK_REUSE_DETECTED, CUSTOMER_DISPUTE_SPIKE, VELOCITY_SPIKE_NEW_SELLER, SEVERE_NAME_MISMATCH).
  - Customers can submit dispute reports with evidence and track case reference (`/api/disputes/:case_reference`).
  - Admins can investigate, take action, resolve tickets with audit history, and suspend fraudulent storefronts.
  - Automated emergency order gating triggered when risk score >= 75.
  - Test Suite 32 passed 100%.

---

### Batch 9: Customer Trust Badges & Direct Transfer Safety Notices [COMPLETED]
- **Objectives**: Render clear, truthful trust badges on storefronts and direct-transfer safety guidance on checkout.
- **Dependencies**: Batch 8.
- **Files Created/Modified**:
  - `src/views/store.ejs` (Verified Individual vs Verified Business badges, Trust Modal, Dispute Modal, Trust Banner)
  - `src/views/checkout.ejs` (Recipient name match indicator, Direct transfer safety box, Anti-diversion warnings, Checkout Dispute Modal)
  - `src/server.ts` (Passed `businessProfile` and `activeBankAccount` to store and checkout views)
  - `tests/run_all_tests.ts` (Added Test Suite 33)
- **Exit Criteria**:
  - Storefront displays accurate verification status (Verified Business with CAC vs Verified Individual vs Under Verification).
  - Storefront displays honest platform disclosures (peer-to-peer bank transfers, no platform escrow, identity verification not an honesty guarantee).
  - Checkout clearly shows recipient bank name, name match status indicator, and direct transfer disclosure.
  - Prominent "Report Payment Diversion" link and self-contained dispute submission flows.
  - Test Suite 33 passed 100%.

---

### Batch 10: Security Hardening, Edge Cases & Automated Test Suite [COMPLETED]
- **Objectives**: Implement comprehensive test suite (Suite 34) testing all verification states, name matching, SSRF defense, gating, OTP, masking, and fraud signals.
- **Dependencies**: Batches 1–9.
- **Files Modified**:
  - `tests/run_all_tests.ts` (Added Suite 34)
- **Exit Criteria**:
  - 100% test pass rate across all 34 test suites (951 tests passing, 0 failing).
  - Outbound SSRF guard blocks all loopbacks, internal IPs, cloud metadata endpoints, and non-HTTPS protocols.
  - AES-256-GCM authentication integrity verified against ciphertext tampering.
  - Masking verified for NUBAN accounts (4+2), short strings, and API keys.
  - Zero regressions.

---

### Batch 11: Production Readiness, Credential Rotation & Deployment Verification [COMPLETED]
- **Objectives**: Final build verification, production credential setup guides, rotation procedures, rollback plan, and operational documentation.
- **Dependencies**: Batch 10.
- **Files Created/Modified**:
  - `docs/security/production-runbook.md`
  - `docs/security/acceptance-criteria.md`
- **Exit Criteria**:
  - `npm run build` compiles cleanly with code 0 in ~8s.
  - Full operational runbook documented covering Monnify production setup, zero-downtime key rotation, incident response, and escalation matrix.
