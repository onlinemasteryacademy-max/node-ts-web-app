"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeed = runSeed;
const node_sqlite_1 = require("node:sqlite");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const db_js_1 = require("./db.js");
const phpJsonPath = node_path_1.default.resolve(__dirname, '../../../php-web-app/data/db_store.json');
const phpDbPath = node_path_1.default.resolve(__dirname, '../../../php-web-app/data/odivo.sqlite');
function runSeed() {
    const targetDbPath = node_path_1.default.resolve(__dirname, '../../data/odivo.sqlite');
    if (node_fs_1.default.existsSync(targetDbPath)) {
        try {
            node_fs_1.default.unlinkSync(targetDbPath);
        }
        catch (e) { }
    }
    const db = (0, db_js_1.getDb)();
    (0, db_js_1.initSchema)(db);
    if (node_fs_1.default.existsSync(phpJsonPath)) {
        console.log('⚡ Seeding database from db_store.json...');
        const jsonData = JSON.parse(node_fs_1.default.readFileSync(phpJsonPath, 'utf8'));
        for (const [table, rows] of Object.entries(jsonData)) {
            if (!Array.isArray(rows) || rows.length === 0)
                continue;
            try {
                db.exec(`DELETE FROM ${table}`);
                const cols = Object.keys(rows[0]);
                const placeholders = cols.map(() => '?').join(', ');
                const insertStmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
                for (const row of rows) {
                    const params = cols.map(c => {
                        const val = row[c];
                        if (val === undefined || val === null)
                            return null;
                        if (typeof val === 'object')
                            return JSON.stringify(val);
                        if (typeof val === 'boolean')
                            return val ? 1 : 0;
                        return val;
                    });
                    insertStmt.run(...params);
                }
                console.log(`✓ Seeded '${table}': ${rows.length} rows.`);
            }
            catch (e) {
                console.log(`⚠️ Note for '${table}': ${e.message}`);
            }
        }
    }
    // Also sync any newer chat messages from SQLite WAL if present
    if (node_fs_1.default.existsSync(phpDbPath)) {
        try {
            const phpDb = new node_sqlite_1.DatabaseSync(phpDbPath);
            const chatMsgs = phpDb.prepare('SELECT * FROM chat_messages').all();
            if (chatMsgs.length > 0) {
                db.exec('DELETE FROM chat_messages');
                const cols = Object.keys(chatMsgs[0]);
                const placeholders = cols.map(() => '?').join(', ');
                const insertStmt = db.prepare(`INSERT INTO chat_messages (${cols.join(', ')}) VALUES (${placeholders})`);
                for (const msg of chatMsgs) {
                    const params = cols.map(c => msg[c]);
                    insertStmt.run(...params);
                }
                console.log(`✓ Synced 'chat_messages' from SQLite DB: ${chatMsgs.length} messages.`);
            }
        }
        catch (err) { }
    }
    console.log('🎉 Database fully seeded and synchronized!');
}
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
    runSeed();
}
