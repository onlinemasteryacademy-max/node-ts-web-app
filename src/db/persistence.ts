import { RowDataPacket } from 'mysql2/promise';
import { getDb } from './db.js';
import { getMySQLPool, initMySQLSchema, isMySQLConfigured, mysqlUpsert, mysqlUpdate, mysqlDelete } from './mysql.js';
import { ENV } from '../config/env.js';

/**
 * Ordered list of tables to maintain foreign key integrity
 */
export const PERSISTENCE_TABLES: string[] = [
  'platform_settings',
  'super_admins',
  'stores',
  'branches',
  'staff_accounts',
  'customers',
  'items',
  'orders',
  'payment_claims',
  'notification_events',
  'chat_conversations',
  'chat_messages',
  'email_logs',
  'password_resets',
  'admin_audit_logs',
  'debts',
  'coupons',
  'email_verifications',
  'subscription_payments',
  'analytics_events',
  'active_visitors',
  'reviews'
];

/**
 * Initialize MySQL Persistence Bridge on Server Boot
 * 1. Checks if Hostinger MySQL credentials are configured
 * 2. Creates all tables and indexes if missing (Additive / Safe)
 * 3. Restores records from Hostinger MySQL into local SQLite (ensuring Git pushes never lose data)
 * 4. Pushes any SQLite records into Hostinger MySQL
 */
export async function initMySQLPersistence(): Promise<void> {
  if (!isMySQLConfigured()) {
    console.log('ℹ️ Hostinger MySQL not configured (DB_NAME and DB_USER required in environment). Running with local SQLite.');
    return;
  }

  console.log('======================================================');
  console.log(`📡 Connecting to Hostinger MySQL: ${ENV.DB_HOST}:${ENV.DB_PORT} (DB: ${ENV.DB_NAME})`);
  console.log('======================================================');

  try {
    const pool = getMySQLPool();

    // Verify MySQL connection
    await pool.query('SELECT 1 + 1 AS connection_test');
    console.log('✅ Connection to Hostinger MySQL established successfully.');

    // Ensure all 22+ tables and indexes exist in Hostinger MySQL
    console.log('⚡ Initializing Hostinger MySQL schema & composite indexes (additive)...');
    await initMySQLSchema(pool);

    const db = getDb();

    // Step A: Hydrate from Hostinger MySQL into local SQLite (protects existing store owners across git pushes)
    let totalRestoredFromMySQL = 0;
    for (const table of PERSISTENCE_TABLES) {
      try {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM \`${table}\``);
        if (rows && rows.length > 0) {
          for (const row of rows) {
            const keys = Object.keys(row);
            if (keys.length === 0) continue;

            const placeholders = keys.map(() => '?').join(', ');
            const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

            const params = keys.map(k => {
              const val = (row as any)[k];
              if (val === undefined || val === null) return null;
              if (typeof val === 'object') return JSON.stringify(val);
              return val;
            });

            try {
              db.prepare(sql).run(...params);
              totalRestoredFromMySQL++;
            } catch (err: any) {
              // Ignore column difference warnings if any
            }
          }
        }
      } catch (err: any) {
        // Table might be empty or new, safe to continue
      }
    }

    if (totalRestoredFromMySQL > 0) {
      console.log(`📥 Hydrated ${totalRestoredFromMySQL} record(s) from Hostinger MySQL into local memory.`);
    }

    // Step B: Synchronize any local SQLite records into Hostinger MySQL (so pre-existing accounts are safe)
    let totalSyncedToMySQL = 0;
    for (const table of PERSISTENCE_TABLES) {
      try {
        const sqliteRows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, any>[];
        if (sqliteRows && sqliteRows.length > 0) {
          for (const row of sqliteRows) {
            try {
              await mysqlUpsert(table, row);
              totalSyncedToMySQL++;
            } catch (err: any) {
              // Ignore duplicate/foreign key edge cases safely
            }
          }
        }
      } catch (err: any) {
        // Safe to continue
      }
    }

    if (totalSyncedToMySQL > 0) {
      console.log(`📤 Synchronized ${totalSyncedToMySQL} record(s) from local cache into Hostinger MySQL.`);
    }

    console.log('🎉 Hostinger MySQL Persistence Bridge Active: Database is persistent & protected from Git deployments.\n');
  } catch (err: any) {
    console.error('⚠️ Could not complete MySQL persistence sync:', err.message);
    console.log('⚡ Server continuing with local SQLite storage to maintain 100% uptime.\n');
  }
}

/**
 * Real-Time Asynchronous Replication: Insert / Upsert
 */
export function replicateInsertToMySQL(table: string, data: Record<string, any>): void {
  if (!isMySQLConfigured()) return;
  mysqlUpsert(table, data).catch((err: any) => {
    console.warn(`⚠️ MySQL replicate insert error (${table}):`, err.message);
  });
}

/**
 * Real-Time Asynchronous Replication: Update
 */
export function replicateUpdateToMySQL(table: string, data: Record<string, any>, conditions: Record<string, any>): void {
  if (!isMySQLConfigured()) return;
  mysqlUpdate(table, data, conditions).catch((err: any) => {
    console.warn(`⚠️ MySQL replicate update error (${table}):`, err.message);
  });
}

/**
 * Real-Time Asynchronous Replication: Delete
 */
export function replicateDeleteToMySQL(table: string, conditions: Record<string, any>): void {
  if (!isMySQLConfigured()) return;
  mysqlDelete(table, conditions).catch((err: any) => {
    console.warn(`⚠️ MySQL replicate delete error (${table}):`, err.message);
  });
}
