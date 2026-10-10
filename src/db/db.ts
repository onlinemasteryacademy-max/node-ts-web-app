import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'odivo.sqlite');

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (!dbInstance || customPath) {
    const targetPath = customPath || dbPath;
    const db = new DatabaseSync(targetPath);
    
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
      db.exec('PRAGMA cache_size = 10000;');
      db.exec('PRAGMA foreign_keys = ON;');
    } catch (e) {}

    initSchema(db);
    if (!customPath) {
      dbInstance = db;
    } else {
      return db;
    }
  }
  return dbInstance;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'super_admin',
      last_login_at TEXT DEFAULT NULL,
      last_login_ip TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      store_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      email TEXT DEFAULT NULL,
      password_hash TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      template_type TEXT DEFAULT 'modern_grid',
      bio TEXT DEFAULT NULL,
      currency_symbol TEXT DEFAULT '₦',
      bank_name TEXT DEFAULT NULL,
      bank_account_number TEXT DEFAULT NULL,
      bank_account_name TEXT DEFAULT NULL,
      payment_instructions TEXT DEFAULT NULL,
      delivery_fee REAL DEFAULT 0.00,
      delivery_fee_type TEXT DEFAULT 'fixed',
      primary_color TEXT DEFAULT '#08110D',
      logo_url TEXT DEFAULT NULL,
      cover_url TEXT DEFAULT NULL,
      alert_sound TEXT DEFAULT 'chime',
      custom_sound_url TEXT DEFAULT NULL,
      plan_tier TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      business_type TEXT DEFAULT 'retail',
      industry_id INTEGER DEFAULT 1,
      template_id INTEGER DEFAULT 1,
      template_slug TEXT DEFAULT 'modern_grid',
      receipt_template TEXT DEFAULT 'standard',
      state TEXT DEFAULT NULL,
      city TEXT DEFAULT NULL,
      subscription_status TEXT DEFAULT 'active',
      plan_expires_at TEXT DEFAULT NULL,
      is_trial_active INTEGER DEFAULT 1,
      trial_ends_at TEXT DEFAULT NULL,
      training_banner_dismissed_at TEXT DEFAULT NULL,
      social_instagram TEXT DEFAULT NULL,
      social_twitter TEXT DEFAULT NULL,
      social_facebook TEXT DEFAULT NULL,
      delivery_zones_json TEXT DEFAULT NULL,
      cover_overlay_color TEXT DEFAULT '#08110D',
      receipt_custom_note TEXT DEFAULT NULL,
      receipt_show_logo INTEGER DEFAULT 1,
      meta_pixel_id TEXT DEFAULT NULL,
      google_tag_id TEXT DEFAULT NULL,
      tiktok_pixel_id TEXT DEFAULT NULL,
      verification_requested INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      owner_id INTEGER DEFAULT NULL,
      custom_domain TEXT DEFAULT NULL,
      custom_domain_status TEXT DEFAULT 'unverified',
      last_login_at TEXT DEFAULT NULL,
      last_login_ip TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      item_type TEXT DEFAULT 'product',
      title TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      description TEXT DEFAULT NULL,
      price REAL NOT NULL,
      compare_price REAL DEFAULT NULL,
      stock_quantity INTEGER DEFAULT -1,
      sku TEXT DEFAULT NULL,
      badge TEXT DEFAULT NULL,
      image_url TEXT DEFAULT NULL,
      gallery_json TEXT DEFAULT NULL,
      variants_json TEXT DEFAULT NULL,
      option_groups_json TEXT DEFAULT NULL,
      specs_json TEXT DEFAULT NULL,
      attributes_json TEXT DEFAULT NULL,
      addons_json TEXT DEFAULT NULL,
      duration_minutes INTEGER DEFAULT NULL,
      service_location_options TEXT DEFAULT NULL,
      is_available INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      order_ref TEXT NOT NULL UNIQUE,
      order_token TEXT DEFAULT NULL,
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT DEFAULT NULL,
      delivery_address TEXT DEFAULT NULL,
      fulfillment_type TEXT DEFAULT 'delivery',
      items_json TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0.00,
      delivery_fee REAL DEFAULT 0.00,
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      payment_proof_ref TEXT DEFAULT NULL,
      payment_status TEXT DEFAULT 'unpaid',
      order_status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT NULL,
      verification_hash TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      phone_normalized TEXT NOT NULL,
      phone_display TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT NULL,
      address TEXT DEFAULT NULL,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0.00,
      first_order_at TEXT DEFAULT NULL,
      last_order_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (store_id, phone_normalized)
    );

    CREATE TABLE IF NOT EXISTS payment_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      store_id INTEGER NOT NULL,
      customer_id INTEGER DEFAULT NULL,
      amount REAL DEFAULT 0.00,
      payment_reference TEXT DEFAULT NULL,
      receipt_url TEXT DEFAULT NULL,
      status TEXT DEFAULT 'claimed',
      claimed_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_reference TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data_json TEXT DEFAULT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (store_id, event_type, event_reference)
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      customer_session_token TEXT NOT NULL,
      customer_id INTEGER DEFAULT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT DEFAULT NULL,
      customer_email TEXT DEFAULT NULL,
      last_order_id INTEGER DEFAULT NULL,
      last_message_preview TEXT DEFAULT NULL,
      last_message_at TEXT NOT NULL,
      unread_merchant_count INTEGER DEFAULT 0,
      unread_customer_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (store_id, customer_session_token)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      order_id INTEGER DEFAULT NULL,
      product_id INTEGER DEFAULT NULL,
      product_title TEXT DEFAULT NULL,
      is_read INTEGER DEFAULT 0,
      idempotency_key TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT DEFAULT NULL,
      subject TEXT NOT NULL,
      template_name TEXT DEFAULT NULL,
      status TEXT DEFAULT 'sent',
      error_message TEXT DEFAULT NULL,
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT DEFAULT 'store',
      account_id INTEGER DEFAULT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      admin_name TEXT DEFAULT NULL,
      action TEXT NOT NULL,
      target_type TEXT DEFAULT NULL,
      target_id INTEGER DEFAULT NULL,
      details TEXT DEFAULT NULL,
      ip_address TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_name TEXT DEFAULT 'Zlik',
      currency_code TEXT DEFAULT 'NGN',
      currency_symbol TEXT DEFAULT '₦',
      pro_monthly_price REAL DEFAULT 5000.00,
      pro_yearly_price REAL DEFAULT 50000.00,
      business_monthly_price REAL DEFAULT 9000.00,
      business_yearly_price REAL DEFAULT 90000.00,
      free_product_limit INTEGER DEFAULT 10,
      free_weekly_posters INTEGER DEFAULT 3,
      plans_config_json TEXT DEFAULT NULL,
      paystack_enabled INTEGER DEFAULT 1,
      paystack_mode TEXT DEFAULT 'test',
      paystack_test_public_key TEXT DEFAULT NULL,
      paystack_test_secret_key TEXT DEFAULT NULL,
      paystack_live_public_key TEXT DEFAULT NULL,
      paystack_live_secret_key TEXT DEFAULT NULL,
      paystack_webhook_secret TEXT DEFAULT NULL,
      paystack_monthly_plan_code TEXT DEFAULT NULL,
      paystack_yearly_plan_code TEXT DEFAULT NULL,
      support_whatsapp TEXT DEFAULT NULL,
      smtp_enabled INTEGER DEFAULT 0,
      smtp_host TEXT DEFAULT NULL,
      smtp_port INTEGER DEFAULT 587,
      smtp_encryption TEXT DEFAULT 'tls',
      smtp_username TEXT DEFAULT NULL,
      smtp_password TEXT DEFAULT NULL,
      smtp_from_email TEXT DEFAULT NULL,
      smtp_from_name TEXT DEFAULT 'Zlik Platform',
      smtp_reply_to TEXT DEFAULT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS industries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT '🛒',
      description TEXT DEFAULT NULL,
      primary_cta TEXT DEFAULT 'Shop Now',
      secondary_cta TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT NULL,
      layout_pattern TEXT DEFAULT 'grid',
      features_json TEXT DEFAULT NULL,
      preview_colors_json TEXT DEFAULT NULL,
      preview_image TEXT DEFAULT NULL,
      theme_config_json TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT NULL,
      permissions_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS enterprise_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT NULL,
      business_name TEXT DEFAULT NULL,
      store_volume TEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      target_tier TEXT DEFAULT 'all',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT DEFAULT NULL,
      due_date TEXT DEFAULT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      properties_json TEXT DEFAULT NULL,
      ip_address TEXT DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      discount_type TEXT DEFAULT 'percentage',
      discount_value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT -1,
      uses_count INTEGER DEFAULT 0,
      expires_at TEXT DEFAULT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      item_id INTEGER DEFAULT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT DEFAULT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      comment TEXT NOT NULL,
      status TEXT DEFAULT 'published',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT NULL,
      phone TEXT NOT NULL,
      role TEXT DEFAULT 'sales_rep',
      permissions_json TEXT DEFAULT '["orders"]',
      pin_code TEXT DEFAULT '1234',
      status TEXT DEFAULT 'active',
      last_login_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT DEFAULT NULL,
      city TEXT DEFAULT NULL,
      phone TEXT DEFAULT NULL,
      manager_name TEXT DEFAULT NULL,
      is_main INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      plan_tier TEXT NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'NGN',
      gateway TEXT DEFAULT 'paystack',
      gateway_reference TEXT DEFAULT NULL,
      status TEXT DEFAULT 'pending',
      channel TEXT DEFAULT NULL,
      metadata_json TEXT DEFAULT NULL,
      paid_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Composite Performance Indices
    CREATE INDEX IF NOT EXISTS idx_store_customer ON customers (store_id, phone_normalized);
    CREATE INDEX IF NOT EXISTS idx_store_claim ON payment_claims (store_id);
    CREATE INDEX IF NOT EXISTS idx_order_claim ON payment_claims (order_id);
    CREATE INDEX IF NOT EXISTS idx_store_notif ON notification_events (store_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_store_conv ON chat_conversations (store_id, last_message_at);
    CREATE INDEX IF NOT EXISTS idx_store_unread ON chat_conversations (store_id, unread_merchant_count);
    CREATE INDEX IF NOT EXISTS idx_cust_conv ON chat_conversations (customer_id);
    CREATE INDEX IF NOT EXISTS idx_conv_msg ON chat_messages (conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_conv_read ON chat_messages (conversation_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_store_msg ON chat_messages (store_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_items_store ON items (store_id, is_available);
    CREATE INDEX IF NOT EXISTS idx_orders_store ON orders (store_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_debts_store ON debts (store_id, status);
    CREATE INDEX IF NOT EXISTS idx_coupons_store ON coupons (store_id, code);
    CREATE INDEX IF NOT EXISTS idx_reviews_store ON reviews (store_id, item_id, status);
    CREATE INDEX IF NOT EXISTS idx_staff_store ON staff_accounts (store_id, status);
    CREATE INDEX IF NOT EXISTS idx_branches_store ON branches (store_id, status);
    CREATE INDEX IF NOT EXISTS idx_email_verif_token ON email_verifications (token);
    CREATE INDEX IF NOT EXISTS idx_email_verif_email ON email_verifications (email);
    CREATE INDEX IF NOT EXISTS idx_sub_payments_ref ON subscription_payments (reference);
    CREATE INDEX IF NOT EXISTS idx_sub_payments_store ON subscription_payments (store_id);
  `);

  // Safe migrations for existing SQLite databases
  const safeAlters = [
    `ALTER TABLE stores ADD COLUMN email_verified INTEGER DEFAULT 0`,
    `ALTER TABLE stores ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'`,
    `ALTER TABLE stores ADD COLUMN paystack_customer_code TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN compare_price REAL DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN stock_quantity INTEGER DEFAULT -1`,
    `ALTER TABLE items ADD COLUMN low_stock_threshold INTEGER DEFAULT 5`,
    `ALTER TABLE items ADD COLUMN sku TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN badge TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN gallery_json TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN option_groups_json TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN specs_json TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN attributes_json TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN is_preorder INTEGER DEFAULT 0`,
    `ALTER TABLE items ADD COLUMN preorder_dispatch_date TEXT DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN branch_id INTEGER DEFAULT NULL`,
    `ALTER TABLE items ADD COLUMN video_url TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN template_slug TEXT DEFAULT 'general'`,
    `ALTER TABLE stores ADD COLUMN cover_url TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN cover_overlay_color TEXT DEFAULT '#08110D'`,
    `ALTER TABLE stores ADD COLUMN receipt_custom_note TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN receipt_show_logo INTEGER DEFAULT 1`,
    `ALTER TABLE stores ADD COLUMN meta_pixel_id TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN google_tag_id TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN tiktok_pixel_id TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN verification_requested INTEGER DEFAULT 0`,
    `ALTER TABLE stores ADD COLUMN is_verified INTEGER DEFAULT 0`,
    `ALTER TABLE stores ADD COLUMN owner_id INTEGER DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN custom_domain TEXT DEFAULT NULL`,
    `ALTER TABLE stores ADD COLUMN custom_domain_status TEXT DEFAULT 'unverified'`,
    `ALTER TABLE orders ADD COLUMN discount_code TEXT DEFAULT NULL`,
    `ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0.00`,
    `ALTER TABLE orders ADD COLUMN branch_id INTEGER DEFAULT NULL`,
    `ALTER TABLE orders ADD COLUMN staff_id INTEGER DEFAULT NULL`,
    `ALTER TABLE platform_settings ADD COLUMN plans_config_json TEXT DEFAULT NULL`,
    `ALTER TABLE platform_settings ADD COLUMN smtp_password TEXT DEFAULT NULL`,
    `ALTER TABLE platform_settings ADD COLUMN smtp_from_name TEXT DEFAULT 'Zlik Platform'`,
    `ALTER TABLE platform_settings ADD COLUMN smtp_reply_to TEXT DEFAULT NULL`
  ];

  for (const sql of safeAlters) {
    try {
      db.exec(sql);
    } catch (e) {
      // Column already exists, safe to ignore
    }
  }

  try {
    // Synchronize legacy seeded rows to current standard platform rates if unedited
    db.exec(`
      UPDATE platform_settings 
      SET pro_monthly_price = 5000.00, 
          pro_yearly_price = 50000.00, 
          business_monthly_price = 9000.00, 
          business_yearly_price = 90000.00 
      WHERE pro_monthly_price = 2500 OR pro_monthly_price = 2500.00 OR business_monthly_price = 15000 OR business_monthly_price = 15000.00;
    `);
  } catch (e) {}

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_stores_domain ON stores (custom_domain);`);
  } catch (e) {}
}

/**
 * DB Fetch One
 */
export function dbFetchOne<T = Record<string, any>>(table: string, conditions: Record<string, any> = {}): T | null {
  const db = getDb();
  const keys = Object.keys(conditions);
  let sql = `SELECT * FROM ${table}`;
  const params: any[] = [];

  if (keys.length > 0) {
    sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ');
    keys.forEach(k => params.push(conditions[k]));
  }
  sql += ' LIMIT 1';

  const stmt = db.prepare(sql);
  const row = stmt.get(...params) as T | undefined;
  return row || null;
}

/**
 * DB Fetch All
 */
export function dbFetchAll<T = Record<string, any>>(
  table: string,
  conditions: Record<string, any> = {},
  orderBy?: string,
  limit?: number
): T[] {
  const db = getDb();
  const keys = Object.keys(conditions);
  let sql = `SELECT * FROM ${table}`;
  const params: any[] = [];

  if (keys.length > 0) {
    sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ');
    keys.forEach(k => params.push(conditions[k]));
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  const stmt = db.prepare(sql);
  return (stmt.all(...params) as T[]) || [];
}

/**
 * DB Insert
 */
export function dbInsert(table: string, data: Record<string, any>): number {
  const db = getDb();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  
  const params = keys.map(k => {
    const val = data[k];
    if (val !== null && typeof val === 'object') {
      return JSON.stringify(val);
    }
    return val;
  });

  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return Number(result.lastInsertRowid);
}

/**
 * DB Update
 */
export function dbUpdate(table: string, data: Record<string, any>, conditions: Record<string, any>): number {
  const db = getDb();
  const setKeys = Object.keys(data);
  const condKeys = Object.keys(conditions);
  
  if (setKeys.length === 0 || condKeys.length === 0) return 0;

  const sql = `UPDATE ${table} SET ${setKeys.map(k => `${k} = ?`).join(', ')} WHERE ${condKeys.map(k => `${k} = ?`).join(' AND ')}`;
  
  const params: any[] = [];
  setKeys.forEach(k => {
    const val = data[k];
    params.push(val !== null && typeof val === 'object' ? JSON.stringify(val) : val);
  });
  condKeys.forEach(k => params.push(conditions[k]));

  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return Number(result.changes);
}

/**
 * DB Delete
 */
export function dbDelete(table: string, conditions: Record<string, any>): number {
  const db = getDb();
  const condKeys = Object.keys(conditions);
  if (condKeys.length === 0) return 0;

  const sql = `DELETE FROM ${table} WHERE ${condKeys.map(k => `${k} = ?`).join(' AND ')}`;
  const params = condKeys.map(k => conditions[k]);

  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return Number(result.changes);
}

/**
 * DB Raw Query
 */
export function dbQuery<T = any>(sql: string, params: any[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  return (stmt.all(...params) as T[]) || [];
}

/**
 * DB Raw Run
 */
export function dbRun(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  const db = getDb();
  const stmt = db.prepare(sql);
  const res = stmt.run(...params);
  return {
    lastInsertRowid: Number(res.lastInsertRowid),
    changes: Number(res.changes)
  };
}
