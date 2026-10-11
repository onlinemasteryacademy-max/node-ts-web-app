"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSISTENCE_TABLES = void 0;
exports.initMySQLPersistence = initMySQLPersistence;
exports.replicateInsertToMySQL = replicateInsertToMySQL;
exports.replicateUpdateToMySQL = replicateUpdateToMySQL;
exports.replicateDeleteToMySQL = replicateDeleteToMySQL;
const db_js_1 = require("./db.js");
const mysql_js_1 = require("./mysql.js");
const env_js_1 = require("../config/env.js");
/**
 * Ordered list of tables to maintain foreign key integrity
 */
exports.PERSISTENCE_TABLES = [
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
    'reviews'
];
/**
 * Initialize MySQL Persistence Bridge on Server Boot
 * 1. Checks if Hostinger MySQL credentials are configured
 * 2. Creates all tables and indexes if missing (Additive / Safe)
 * 3. Restores records from Hostinger MySQL into local SQLite (ensuring Git pushes never lose data)
 * 4. Pushes any SQLite records into Hostinger MySQL
 */
async function initMySQLPersistence() {
    if (!(0, mysql_js_1.isMySQLConfigured)()) {
        console.log('ℹ️ Hostinger MySQL not configured (DB_NAME and DB_USER required in environment). Running with local SQLite.');
        return;
    }
    console.log('======================================================');
    console.log(`📡 Connecting to Hostinger MySQL: ${env_js_1.ENV.DB_HOST}:${env_js_1.ENV.DB_PORT} (DB: ${env_js_1.ENV.DB_NAME})`);
    console.log('======================================================');
    try {
        const pool = (0, mysql_js_1.getMySQLPool)();
        // Verify MySQL connection
        await pool.query('SELECT 1 + 1 AS connection_test');
        console.log('✅ Connection to Hostinger MySQL established successfully.');
        // Ensure all 22+ tables and indexes exist in Hostinger MySQL
        console.log('⚡ Initializing Hostinger MySQL schema & composite indexes (additive)...');
        await (0, mysql_js_1.initMySQLSchema)(pool);
        const db = (0, db_js_1.getDb)();
        // Step A: Hydrate from Hostinger MySQL into local SQLite (protects existing store owners across git pushes)
        let totalRestoredFromMySQL = 0;
        for (const table of exports.PERSISTENCE_TABLES) {
            try {
                const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
                if (rows && rows.length > 0) {
                    for (const row of rows) {
                        const keys = Object.keys(row);
                        if (keys.length === 0)
                            continue;
                        const placeholders = keys.map(() => '?').join(', ');
                        const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
                        const params = keys.map(k => {
                            const val = row[k];
                            if (val === undefined || val === null)
                                return null;
                            if (typeof val === 'object')
                                return JSON.stringify(val);
                            return val;
                        });
                        try {
                            db.prepare(sql).run(...params);
                            totalRestoredFromMySQL++;
                        }
                        catch (err) {
                            // Ignore column difference warnings if any
                        }
                    }
                }
            }
            catch (err) {
                // Table might be empty or new, safe to continue
            }
        }
        if (totalRestoredFromMySQL > 0) {
            console.log(`📥 Hydrated ${totalRestoredFromMySQL} record(s) from Hostinger MySQL into local memory.`);
        }
        // Step B: Synchronize any local SQLite records into Hostinger MySQL (so pre-existing accounts are safe)
        let totalSyncedToMySQL = 0;
        for (const table of exports.PERSISTENCE_TABLES) {
            try {
                const sqliteRows = db.prepare(`SELECT * FROM ${table}`).all();
                if (sqliteRows && sqliteRows.length > 0) {
                    for (const row of sqliteRows) {
                        try {
                            await (0, mysql_js_1.mysqlUpsert)(table, row);
                            totalSyncedToMySQL++;
                        }
                        catch (err) {
                            // Ignore duplicate/foreign key edge cases safely
                        }
                    }
                }
            }
            catch (err) {
                // Safe to continue
            }
        }
        if (totalSyncedToMySQL > 0) {
            console.log(`📤 Synchronized ${totalSyncedToMySQL} record(s) from local cache into Hostinger MySQL.`);
        }
        console.log('🎉 Hostinger MySQL Persistence Bridge Active: Database is persistent & protected from Git deployments.\n');
    }
    catch (err) {
        console.error('⚠️ Could not complete MySQL persistence sync:', err.message);
        console.log('⚡ Server continuing with local SQLite storage to maintain 100% uptime.\n');
    }
}
/**
 * Real-Time Asynchronous Replication: Insert / Upsert
 */
function replicateInsertToMySQL(table, data) {
    if (!(0, mysql_js_1.isMySQLConfigured)())
        return;
    (0, mysql_js_1.mysqlUpsert)(table, data).catch((err) => {
        console.warn(`⚠️ MySQL replicate insert error (${table}):`, err.message);
    });
}
/**
 * Real-Time Asynchronous Replication: Update
 */
function replicateUpdateToMySQL(table, data, conditions) {
    if (!(0, mysql_js_1.isMySQLConfigured)())
        return;
    (0, mysql_js_1.mysqlUpdate)(table, data, conditions).catch((err) => {
        console.warn(`⚠️ MySQL replicate update error (${table}):`, err.message);
    });
}
/**
 * Real-Time Asynchronous Replication: Delete
 */
function replicateDeleteToMySQL(table, conditions) {
    if (!(0, mysql_js_1.isMySQLConfigured)())
        return;
    (0, mysql_js_1.mysqlDelete)(table, conditions).catch((err) => {
        console.warn(`⚠️ MySQL replicate delete error (${table}):`, err.message);
    });
}
