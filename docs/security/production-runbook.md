# Zlik Complete Fraud Prevention, Seller Verification & Trust System
## Production Operational Runbook & Credential Rotation Guide

**Version**: 1.0.0  
**Status**: Production-Ready  
**Compliance**: Nigeria Data Protection Act (NDPA 2023), CAMA 2020, CBN Guidelines  

---

## 1. System Overview & Key Architecture

Zlik operates as a peer-to-peer storefront and order-orchestration platform in Nigeria. Payment transfers occur directly from customer accounts to merchant bank accounts without platform escrow.

The security system guarantees platform integrity and buyer safety through six defensive pillars:
1. **Accountable Identities**: All personal merchants undergo BVN/NIN validation; legal business merchants undergo CAC corporate registry validation.
2. **Payout Bank Ownership Verification**: Every merchant bank account is verified against the seller's legal or registered business name using an adaptive Nigerian fuzzy name matcher (Jaro-Winkler + token overlap).
3. **Account Change Protection**: Payout bank account changes require re-authentication and time-limited, encrypted OTP verification.
4. **Automated Order Gating**: Unverified storefronts, suspended accounts, and merchants crossing critical risk thresholds (risk score &ge; 75) are automatically gated (buyers cannot create orders or initiate transfers).
5. **Direct Transfer Disclosures & Name Match Indicators**: Public storefronts and checkout screens display clear verification badges (Verified Individual vs CAC Verified Business) and safety notices to eliminate payment diversion.
6. **Explainable Fraud Risk Engine & Dispute Case Management**: Real-time risk scoring with explainable reason codes (`BANK_REUSE_DETECTED`, `CUSTOMER_DISPUTE_SPIKE`, `VELOCITY_SPIKE_NEW_SELLER`, `SEVERE_NAME_MISMATCH`) and an administrative dispute management console.

---

## 2. Environment Variables & Secret Key Hierarchy

The platform isolates all encryption keys from database storage.

| Environment Variable | Required | Default / Fallback | Description |
|----------------------|----------|-------------------|-------------|
| `SECURITY_ENCRYPTION_KEY` | Recommended in Production | Derived SHA-256 fallback from `SESSION_SECRET` | 32-byte secret used for AES-256-GCM authenticated encryption of API keys, client secrets, and merchant bank account numbers. |
| `SESSION_SECRET` | Required | Built-in fallback | Used for cryptographic session signing and key derivation. |
| `ADMIN_SECRET_PATH` | Required | `admin` | Obfuscated route segment for the Super Admin Control Console. |
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` | Optional (Production Bridge) | Local SQLite only | Hostinger MySQL connection credentials for zero-loss bidirectional data replication. |
| `SUPER_ADMIN_EMAIL` | Optional | `admin@zlik.store` | Super admin notification recipient for enterprise alerts and critical dispute filings. |

---

## 3. Super Admin Monnify Integration Setup (Step-by-Step)

Administrators configure, test, and manage third-party verification providers without code deployments.

### Initial Monnify Setup:
1. Log in to the Super Admin Dashboard:
   ```
   https://yourdomain.com/<ADMIN_SECRET_PATH>/login
   ```
2. Navigate to **Security & Trust &rarr; Integrations** (`/<ADMIN_SECRET_PATH>/security/integrations`).
3. Select **Monnify Verification Services &rarr; Configure Provider**.
4. Configure connection parameters:
   - **Environment**: Select `Sandbox` for staging/testing or `Production` for live operation.
   - **Base URL**:
     - Sandbox: `https://sandbox.monnify.com`
     - Production: `https://api.monnify.com`
   - **API Key**: Enter the Monnify API Key.
   - **Secret Key**: Enter the Monnify Secret Key.
   - **Contract Code**: Enter your approved Monnify contract code.
   - **Enabled Capabilities**: Select `account_enquiry`, `bvn_match`, and `nin_match`.
5. Click **Save & Encrypt Credentials**.
   - *Security Note*: Secrets are immediately encrypted using AES-256-GCM before database insertion. Plaintext credentials are never written to disk, logged, or returned in browser responses.
6. Click **Test API Connection**.
   - Verifies network connectivity, TLS handshake, and outbound SSRF validation.
   - The test request is sent through the SSRF guard restricting destinations to approved provider hostnames.
7. Upon successful API test, toggle the provider status from `not_configured` / `testing` to **Active**.

---

## 4. Zero-Downtime Credential Rotation Protocol

When rotating API keys, client secrets, or encryption keys:

### A. Provider Credential Rotation (Monnify API Key / Secret):
1. Generate new API credentials in the Monnify Developer Console.
2. Open the Zlik Super Admin Integration Console (`/<ADMIN_SECRET_PATH>/security/integrations`).
3. Enter the new API Key and Secret Key into the configuration form.
4. Keep the provider in `testing` mode and click **Test API Connection**.
5. Once the test succeeds, change status to **Active** and save.
6. Revoke the old API keys in the Monnify Developer Console.
7. *Audit Trail*: A `PROVIDER_CONFIG_UPDATED` record is logged in `security_audit_logs`.

### B. Master Encryption Key Rotation (`SECURITY_ENCRYPTION_KEY`):
If the host server's `SECURITY_ENCRYPTION_KEY` must be rotated:
1. Export the existing database snapshot.
2. Initialize migration script with the old key and new key.
3. Re-encrypt all rows in `verification_provider_configs` and `seller_bank_accounts`:
   ```ts
   const decrypted = decryptSecret(row.encrypted_val, OLD_KEY);
   const reEncrypted = encryptSecret(decrypted, NEW_KEY);
   ```
4. Deploy the updated `SECURITY_ENCRYPTION_KEY` environment variable.
5. Restart the server.

---

## 5. Emergency Incident Response & Order Gating Runbook

### Incident A: Suspected Payment Diversion or Merchant Impersonation
When a merchant is reported for diverting customer payments to unverified bank accounts or impersonating a brand:

1. **Investigate the Report**:
   - Navigate to `/<ADMIN_SECRET_PATH>/security/disputes`.
   - Locate the open case reference (e.g. `FR-2026-XXXXXX`).
   - Review reported messages, screenshot attachments, and merchant account name discrepancies.
2. **Immediate Store Suspension (One-Click Emergency Action)**:
   - In the dispute details panel, click **Suspend Seller**.
   - This atomically executes:
     - `stores.status = 'suspended'`
     - `seller_profiles.composite_verification_status = 'suspended'`
     - `seller_profiles.order_gating_enabled = 1`
     - Inserts a `SELLER_SUSPENDED` event into `fraud_case_events`
     - Closes the dispute as `resolved_seller_suspended`
   - Storefront immediately prevents orders, hides bank account details, and prevents checkout.
3. **If Seller is Cleared**:
   - If investigation proves the merchant was falsely reported, Super Admin clicks **Resolve & Clear Seller**.
   - The store is restored to active status, and order gating is lifted.

### Incident B: Third-Party Verification Provider Outage
If Monnify experiences degraded performance or an unexpected outage:
1. Open `/<ADMIN_SECRET_PATH>/security/integrations`.
2. Toggle the Monnify provider status to **Degraded** or **Disabled**.
3. *Fallback Behavior*:
   - Unverified merchants remain in `pending` / `manual_review` queue.
   - Existing verified sellers continue operating without interruption.
   - Incoming CAC submissions and bank accounts are safely queued in `pending` status for manual review in the Security Queue (`/<ADMIN_SECRET_PATH>/security/queue`).
   - Zero fake approvals: unverified merchants are never automatically promoted.

---

## 6. Dispute Case Management Escalation Matrix

| Category | Severity | Initial SLA | Primary Action |
|----------|----------|-------------|----------------|
| `payment_diversion` | **Critical** | < 2 Hours | Cross-check checkout bank account vs reported alternate account. If confirmed diversion, immediately suspend storefront. |
| `impersonation` | **Critical** | < 4 Hours | Inspect CAC documents or brand trademark. If unauthorized, revoke verified badge and require store renaming. |
| `non_delivery` | **High** | < 12 Hours | Contact merchant via registered WhatsApp/Email. Request delivery tracking / proof of dispatch within 24 hours. |
| `counterfeit_item` | **Medium** | < 24 Hours | Require item removal from catalog; flag merchant for manual item review. |
| `unresponsive_merchant` | **Medium** | < 24 Hours | Automated reminder sent to merchant; temporary order gating if unresponsive for > 48 hours. |

---

## 7. Dual-Database Maintenance & Replication Bridge

Zlik operates dual-database persistence:
- **Local SQLite (WAL mode)**: Provides sub-millisecond query responses and transaction speed (`sqlite3` / `better-sqlite3`).
- **Hostinger MySQL Replication**: Replicates all 32 core tables (including 10 security tables) to MySQL.

### Verification Commands:
- Check local database health:
  ```bash
  npm test
  ```
  Runs all 34 test suites covering 950+ assertions with zero failures.
- Check build compilation:
  ```bash
  npm run build
  ```
  Compiles TypeScript cleanly to `dist/` and syncs static assets.
