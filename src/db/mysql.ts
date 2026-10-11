import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { ENV } from '../config/env.js';

let mysqlPool: Pool | null = null;

export function getMySQLPool(): Pool {
  if (!mysqlPool) {
    const config: PoolOptions = {
      host: ENV.DB_HOST || 'localhost',
      port: Number(ENV.DB_PORT) || 3306,
      user: ENV.DB_USER,
      password: ENV.DB_PASSWORD,
      database: ENV.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true,
      decimalNumbers: true
    };

    mysqlPool = mysql.createPool(config);
  }
  return mysqlPool;
}

export function isMySQLConfigured(): boolean {
  return Boolean(ENV.DB_NAME && ENV.DB_USER);
}

/**
 * Initialize MySQL Schema (Additive & Safe - Never Drops Tables or Overwrites Data)
 */
export async function initMySQLSchema(pool?: Pool): Promise<void> {
  const p = pool || getMySQLPool();

  const tableDefinitions = [
    `CREATE TABLE IF NOT EXISTS super_admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'super_admin',
      last_login_at VARCHAR(100) DEFAULT NULL,
      last_login_ip VARCHAR(100) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS stores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      store_name VARCHAR(255) NOT NULL,
      owner_name VARCHAR(255) NOT NULL,
      email VARCHAR(191) DEFAULT NULL,
      password_hash VARCHAR(255) NOT NULL,
      whatsapp_number VARCHAR(100) NOT NULL,
      template_type VARCHAR(100) DEFAULT 'modern_grid',
      bio TEXT DEFAULT NULL,
      currency_symbol VARCHAR(10) DEFAULT '₦',
      bank_name VARCHAR(255) DEFAULT NULL,
      bank_account_number VARCHAR(100) DEFAULT NULL,
      bank_account_name VARCHAR(255) DEFAULT NULL,
      payment_instructions TEXT DEFAULT NULL,
      delivery_fee DECIMAL(12,2) DEFAULT 0.00,
      delivery_fee_type VARCHAR(50) DEFAULT 'fixed',
      primary_color VARCHAR(50) DEFAULT '#08110D',
      logo_url TEXT DEFAULT NULL,
      cover_url TEXT DEFAULT NULL,
      alert_sound VARCHAR(100) DEFAULT 'chime',
      custom_sound_url TEXT DEFAULT NULL,
      plan_tier VARCHAR(50) DEFAULT 'free',
      status VARCHAR(50) DEFAULT 'active',
      business_type VARCHAR(100) DEFAULT 'retail',
      industry_id INT DEFAULT 1,
      template_id INT DEFAULT 1,
      template_slug VARCHAR(100) DEFAULT 'modern_grid',
      receipt_template VARCHAR(100) DEFAULT 'standard',
      state VARCHAR(100) DEFAULT NULL,
      city VARCHAR(100) DEFAULT NULL,
      subscription_status VARCHAR(50) DEFAULT 'active',
      plan_expires_at VARCHAR(100) DEFAULT NULL,
      is_trial_active TINYINT DEFAULT 1,
      trial_ends_at VARCHAR(100) DEFAULT NULL,
      training_banner_dismissed_at VARCHAR(100) DEFAULT NULL,
      social_instagram VARCHAR(255) DEFAULT NULL,
      social_twitter VARCHAR(255) DEFAULT NULL,
      social_facebook VARCHAR(255) DEFAULT NULL,
      delivery_zones_json LONGTEXT DEFAULT NULL,
      cover_overlay_color VARCHAR(50) DEFAULT '#08110D',
      receipt_custom_note TEXT DEFAULT NULL,
      receipt_show_logo TINYINT DEFAULT 1,
      meta_pixel_id VARCHAR(100) DEFAULT NULL,
      google_tag_id VARCHAR(100) DEFAULT NULL,
      tiktok_pixel_id VARCHAR(100) DEFAULT NULL,
      verification_requested TINYINT DEFAULT 0,
      is_verified TINYINT DEFAULT 0,
      owner_id INT DEFAULT NULL,
      custom_domain VARCHAR(191) DEFAULT NULL,
      custom_domain_status VARCHAR(50) DEFAULT 'unverified',
      email_verified TINYINT DEFAULT 0,
      billing_cycle VARCHAR(50) DEFAULT 'monthly',
      paystack_customer_code VARCHAR(255) DEFAULT NULL,
      last_login_at VARCHAR(100) DEFAULT NULL,
      last_login_ip VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      item_type VARCHAR(50) DEFAULT 'product',
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) DEFAULT 'General',
      description TEXT DEFAULT NULL,
      price DECIMAL(12,2) NOT NULL,
      compare_price DECIMAL(12,2) DEFAULT NULL,
      stock_quantity INT DEFAULT -1,
      low_stock_threshold INT DEFAULT 5,
      sku VARCHAR(100) DEFAULT NULL,
      badge VARCHAR(100) DEFAULT NULL,
      image_url TEXT DEFAULT NULL,
      gallery_json LONGTEXT DEFAULT NULL,
      variants_json LONGTEXT DEFAULT NULL,
      option_groups_json LONGTEXT DEFAULT NULL,
      specs_json LONGTEXT DEFAULT NULL,
      attributes_json LONGTEXT DEFAULT NULL,
      addons_json LONGTEXT DEFAULT NULL,
      duration_minutes INT DEFAULT NULL,
      service_location_options TEXT DEFAULT NULL,
      is_available TINYINT DEFAULT 1,
      is_preorder TINYINT DEFAULT 0,
      preorder_dispatch_date VARCHAR(100) DEFAULT NULL,
      branch_id INT DEFAULT NULL,
      video_url TEXT DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      order_ref VARCHAR(100) NOT NULL UNIQUE,
      order_token VARCHAR(255) DEFAULT NULL,
      customer_id INT DEFAULT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(100) NOT NULL,
      customer_email VARCHAR(255) DEFAULT NULL,
      delivery_address TEXT DEFAULT NULL,
      fulfillment_type VARCHAR(50) DEFAULT 'delivery',
      items_json LONGTEXT DEFAULT NULL,
      subtotal DECIMAL(12,2) DEFAULT 0.00,
      delivery_fee DECIMAL(12,2) DEFAULT 0.00,
      discount_code VARCHAR(100) DEFAULT NULL,
      discount_amount DECIMAL(12,2) DEFAULT 0.00,
      total_amount DECIMAL(12,2) NOT NULL,
      payment_method VARCHAR(100) DEFAULT 'bank_transfer',
      payment_proof_ref VARCHAR(255) DEFAULT NULL,
      payment_status VARCHAR(50) DEFAULT 'unpaid',
      order_status VARCHAR(50) DEFAULT 'pending',
      notes TEXT DEFAULT NULL,
      verification_hash VARCHAR(255) DEFAULT NULL,
      branch_id INT DEFAULT NULL,
      staff_id INT DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      phone_normalized VARCHAR(100) NOT NULL,
      phone_display VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) DEFAULT NULL,
      address TEXT DEFAULT NULL,
      total_orders INT DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0.00,
      first_order_at VARCHAR(100) DEFAULT NULL,
      last_order_at VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL,
      UNIQUE KEY uniq_store_cust_phone (store_id, phone_normalized)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS payment_claims (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL UNIQUE,
      store_id INT NOT NULL,
      customer_id INT DEFAULT NULL,
      amount DECIMAL(12,2) DEFAULT 0.00,
      payment_reference VARCHAR(255) DEFAULT NULL,
      receipt_url TEXT DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'claimed',
      claimed_at VARCHAR(100) NOT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS notification_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      event_reference VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      data_json LONGTEXT DEFAULT NULL,
      is_read TINYINT DEFAULT 0,
      created_at VARCHAR(100) DEFAULT NULL,
      UNIQUE KEY uniq_store_notif_evt (store_id, event_type, event_reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS chat_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      customer_session_token VARCHAR(191) NOT NULL,
      customer_id INT DEFAULT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(100) DEFAULT NULL,
      customer_email VARCHAR(255) DEFAULT NULL,
      last_order_id INT DEFAULT NULL,
      last_message_preview TEXT DEFAULT NULL,
      last_message_at VARCHAR(100) NOT NULL,
      unread_merchant_count INT DEFAULT 0,
      unread_customer_count INT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL,
      UNIQUE KEY uniq_store_chat_sess (store_id, customer_session_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      store_id INT NOT NULL,
      sender_type VARCHAR(50) NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      order_id INT DEFAULT NULL,
      product_id INT DEFAULT NULL,
      product_title VARCHAR(255) DEFAULT NULL,
      is_read TINYINT DEFAULT 0,
      idempotency_key VARCHAR(191) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS email_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255) DEFAULT NULL,
      subject VARCHAR(255) NOT NULL,
      template_name VARCHAR(100) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'sent',
      error_message TEXT DEFAULT NULL,
      sent_at VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_type VARCHAR(50) DEFAULT 'store',
      account_id INT DEFAULT NULL,
      email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at VARCHAR(100) NOT NULL,
      used TINYINT DEFAULT 0,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      admin_name VARCHAR(255) DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(100) DEFAULT NULL,
      target_id INT DEFAULT NULL,
      details TEXT DEFAULT NULL,
      ip_address VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS platform_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      platform_name VARCHAR(255) DEFAULT 'Zlik',
      currency_code VARCHAR(10) DEFAULT 'NGN',
      currency_symbol VARCHAR(10) DEFAULT '₦',
      pro_monthly_price DECIMAL(12,2) DEFAULT 5000.00,
      pro_yearly_price DECIMAL(12,2) DEFAULT 50000.00,
      business_monthly_price DECIMAL(12,2) DEFAULT 9000.00,
      business_yearly_price DECIMAL(12,2) DEFAULT 90000.00,
      free_product_limit INT DEFAULT 10,
      free_weekly_posters INT DEFAULT 3,
      plans_config_json LONGTEXT DEFAULT NULL,
      paystack_enabled TINYINT DEFAULT 1,
      paystack_mode VARCHAR(50) DEFAULT 'test',
      paystack_test_public_key VARCHAR(255) DEFAULT NULL,
      paystack_test_secret_key VARCHAR(255) DEFAULT NULL,
      paystack_live_public_key VARCHAR(255) DEFAULT NULL,
      paystack_live_secret_key VARCHAR(255) DEFAULT NULL,
      paystack_webhook_secret VARCHAR(255) DEFAULT NULL,
      paystack_monthly_plan_code VARCHAR(255) DEFAULT NULL,
      paystack_yearly_plan_code VARCHAR(255) DEFAULT NULL,
      support_whatsapp VARCHAR(100) DEFAULT NULL,
      smtp_enabled TINYINT DEFAULT 0,
      smtp_host VARCHAR(255) DEFAULT NULL,
      smtp_port INT DEFAULT 587,
      smtp_encryption VARCHAR(50) DEFAULT 'tls',
      smtp_username VARCHAR(255) DEFAULT NULL,
      smtp_password VARCHAR(255) DEFAULT NULL,
      smtp_from_email VARCHAR(255) DEFAULT NULL,
      smtp_from_name VARCHAR(255) DEFAULT 'Zlik Platform',
      smtp_reply_to VARCHAR(255) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS debts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      description TEXT DEFAULT NULL,
      due_date VARCHAR(100) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      code VARCHAR(100) NOT NULL,
      discount_type VARCHAR(50) DEFAULT 'percentage',
      discount_value DECIMAL(12,2) NOT NULL,
      min_order_amount DECIMAL(12,2) DEFAULT 0,
      max_uses INT DEFAULT -1,
      uses_count INT DEFAULT 0,
      expires_at VARCHAR(100) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'active',
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS email_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      token VARCHAR(191) NOT NULL UNIQUE,
      payload_json LONGTEXT NOT NULL,
      attempts INT DEFAULT 0,
      expires_at VARCHAR(100) NOT NULL,
      used TINYINT DEFAULT 0,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS subscription_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      reference VARCHAR(191) NOT NULL UNIQUE,
      plan_tier VARCHAR(50) NOT NULL,
      billing_cycle VARCHAR(50) NOT NULL DEFAULT 'monthly',
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'NGN',
      gateway VARCHAR(50) DEFAULT 'paystack',
      gateway_reference VARCHAR(255) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      channel VARCHAR(100) DEFAULT NULL,
      metadata_json LONGTEXT DEFAULT NULL,
      paid_at VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS analytics_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      event_name VARCHAR(100) NOT NULL,
      properties_json LONGTEXT DEFAULT NULL,
      ip_address VARCHAR(100) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      item_id INT DEFAULT NULL,
      order_id INT DEFAULT NULL,
      customer_id INT DEFAULT NULL,
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(100) DEFAULT NULL,
      customer_phone_hash VARCHAR(100) DEFAULT NULL,
      rating INT NOT NULL DEFAULT 5,
      comment TEXT NOT NULL,
      is_verified_purchase TINYINT DEFAULT 1,
      status VARCHAR(50) DEFAULT 'pending_review',
      moderated_at VARCHAR(100) DEFAULT NULL,
      moderated_by VARCHAR(255) DEFAULT NULL,
      rejection_reason TEXT DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS staff_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) DEFAULT NULL,
      phone VARCHAR(100) NOT NULL,
      role VARCHAR(50) DEFAULT 'sales_rep',
      permissions_json LONGTEXT DEFAULT NULL,
      pin_code VARCHAR(50) DEFAULT '1234',
      status VARCHAR(50) DEFAULT 'active',
      last_login_at VARCHAR(100) DEFAULT NULL,
      created_at VARCHAR(100) DEFAULT NULL,
      updated_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      address TEXT DEFAULT NULL,
      city VARCHAR(100) DEFAULT NULL,
      phone VARCHAR(100) DEFAULT NULL,
      manager_name VARCHAR(255) DEFAULT NULL,
      is_main TINYINT DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at VARCHAR(100) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const sql of tableDefinitions) {
    try {
      await p.query(sql);
    } catch (err: any) {
      console.warn('⚠️ Note during MySQL table initialization:', err.message);
    }
  }

  // Create Indexes safely
  const indexes = [
    `CREATE INDEX idx_stores_email ON stores (email);`,
    `CREATE INDEX idx_stores_domain ON stores (custom_domain);`,
    `CREATE INDEX idx_items_store ON items (store_id, is_available);`,
    `CREATE INDEX idx_orders_store ON orders (store_id);`,
    `CREATE INDEX idx_debts_store ON debts (store_id, status);`,
    `CREATE INDEX idx_coupons_store ON coupons (store_id, code);`,
    `CREATE INDEX idx_reviews_store ON reviews (store_id, item_id, status);`,
    `CREATE INDEX idx_staff_store ON staff_accounts (store_id, status);`,
    `CREATE INDEX idx_branches_store ON branches (store_id, status);`,
    `CREATE INDEX idx_email_verif_token ON email_verifications (token);`,
    `CREATE INDEX idx_email_verif_email ON email_verifications (email);`,
    `CREATE INDEX idx_sub_payments_ref ON subscription_payments (reference);`,
    `CREATE INDEX idx_sub_payments_store ON subscription_payments (store_id);`,
    `CREATE UNIQUE INDEX idx_reviews_unique_buyer ON reviews (store_id, item_id, customer_phone_hash);`
  ];

  // Safe column alters for existing MySQL database
  const safeAlters = [
    `ALTER TABLE reviews ADD COLUMN order_id INT DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN customer_id INT DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN customer_phone_hash VARCHAR(100) DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN is_verified_purchase TINYINT DEFAULT 1;`,
    `ALTER TABLE reviews ADD COLUMN moderated_at VARCHAR(100) DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN moderated_by VARCHAR(255) DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN rejection_reason TEXT DEFAULT NULL;`,
    `ALTER TABLE reviews ADD COLUMN updated_at VARCHAR(100) DEFAULT NULL;`
  ];

  for (const alterSql of safeAlters) {
    try {
      await p.query(alterSql);
    } catch (e) {
      // Column already exists, safe to ignore
    }
  }

  for (const idxSql of indexes) {
    try {
      await p.query(idxSql);
    } catch (e) {
      // Index already exists, safe to ignore
    }
  }
}

/**
 * Parameterized MySQL Query Helper Functions
 */
export async function mysqlFetchOne<T = Record<string, any>>(table: string, conditions: Record<string, any> = {}): Promise<T | null> {
  const p = getMySQLPool();
  const keys = Object.keys(conditions);
  let sql = `SELECT * FROM \`${table}\``;
  const params: any[] = [];

  if (keys.length > 0) {
    sql += ' WHERE ' + keys.map(k => `\`${k}\` = ?`).join(' AND ');
    keys.forEach(k => params.push(conditions[k]));
  }
  sql += ' LIMIT 1';

  const [rows] = await p.query<RowDataPacket[]>(sql, params);
  return (rows[0] as T) || null;
}

export async function mysqlFetchAll<T = Record<string, any>>(
  table: string,
  conditions: Record<string, any> = {},
  orderBy?: string,
  limit?: number
): Promise<T[]> {
  const p = getMySQLPool();
  const keys = Object.keys(conditions);
  let sql = `SELECT * FROM \`${table}\``;
  const params: any[] = [];

  if (keys.length > 0) {
    sql += ' WHERE ' + keys.map(k => `\`${k}\` = ?`).join(' AND ');
    keys.forEach(k => params.push(conditions[k]));
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }
  if (limit) {
    sql += ` LIMIT ${Number(limit)}`;
  }

  const [rows] = await p.query<RowDataPacket[]>(sql, params);
  return (rows as T[]) || [];
}

export async function mysqlInsert(table: string, data: Record<string, any>): Promise<number> {
  const p = getMySQLPool();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`;

  const params = keys.map(k => {
    const val = data[k];
    if (val !== null && typeof val === 'object') {
      return JSON.stringify(val);
    }
    return val;
  });

  const [result] = await p.query<ResultSetHeader>(sql, params);
  return result.insertId;
}

export async function mysqlUpdate(table: string, data: Record<string, any>, conditions: Record<string, any>): Promise<number> {
  const p = getMySQLPool();
  const setKeys = Object.keys(data);
  const condKeys = Object.keys(conditions);

  if (setKeys.length === 0 || condKeys.length === 0) return 0;

  const sql = `UPDATE \`${table}\` SET ${setKeys.map(k => `\`${k}\` = ?`).join(', ')} WHERE ${condKeys.map(k => `\`${k}\` = ?`).join(' AND ')}`;

  const params: any[] = [];
  setKeys.forEach(k => {
    const val = data[k];
    params.push(val !== null && typeof val === 'object' ? JSON.stringify(val) : val);
  });
  condKeys.forEach(k => params.push(conditions[k]));

  const [result] = await p.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}

export async function mysqlDelete(table: string, conditions: Record<string, any>): Promise<number> {
  const p = getMySQLPool();
  const condKeys = Object.keys(conditions);
  if (condKeys.length === 0) return 0;

  const sql = `DELETE FROM \`${table}\` WHERE ${condKeys.map(k => `\`${k}\` = ?`).join(' AND ')}`;
  const params = condKeys.map(k => conditions[k]);

  const [result] = await p.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}

export async function mysqlQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const p = getMySQLPool();
  const [rows] = await p.query<RowDataPacket[]>(sql, params);
  return (rows as unknown as T[]) || [];
}
