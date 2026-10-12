"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
exports.loadEnv = loadEnv;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Universal Environment Loader
 * Loads .env file into process.env if present
 */
function loadEnv() {
    const candidatePaths = [
        node_path_1.default.resolve(process.cwd(), '.env'),
        node_path_1.default.resolve(process.cwd(), 'node-ts-web-app', '.env'),
        node_path_1.default.resolve(__dirname, '..', '..', '.env'),
        node_path_1.default.resolve(__dirname, '..', '.env')
    ];
    const envPath = candidatePaths.find(p => node_fs_1.default.existsSync(p));
    if (!envPath)
        return;
    try {
        const content = node_fs_1.default.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const equalsIndex = trimmed.indexOf('=');
            if (equalsIndex === -1)
                continue;
            const key = trimmed.slice(0, equalsIndex).trim();
            let value = trimmed.slice(equalsIndex + 1).trim();
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
    catch (err) {
        console.warn('⚠️ Warning: Failed to load .env file:', err);
    }
}
// Automatically load on import
loadEnv();
exports.ENV = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_PRODUCTION: (process.env.NODE_ENV || '').toLowerCase() === 'production',
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || '0.0.0.0',
    APP_URL: (process.env.APP_URL || 'https://zlik.store').replace(/\/+$/, ''),
    SESSION_SECRET: process.env.SESSION_SECRET || 'zlik_super_secure_production_secret_key_98374298734982739847239847293847!',
    SUPER_ADMIN_EMAIL: (process.env.SUPER_ADMIN_EMAIL || 'admin@zlik.store').toLowerCase().trim(),
    SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || 'Zlik#Admin!2026@Security',
    SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || 'Platform Super Administrator',
    ADMIN_SECRET_PATH: (process.env.ADMIN_SECRET_PATH || 'zlik-ops-9x7q2m8b').replace(/^\/+|\/+$/g, ''),
    RESET_SUPER_ADMIN_PASSWORD: process.env.RESET_SUPER_ADMIN_PASSWORD === 'true',
    // Database Configuration (Hostinger MySQL / SQLite)
    DB_TYPE: (process.env.DB_TYPE || (process.env.DB_NAME && process.env.DB_USER ? 'mysql' : 'sqlite')).toLowerCase(),
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
    DB_NAME: process.env.DB_NAME || '',
    DB_USER: process.env.DB_USER || '',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    // Persistent Storage Directories (Safe from Git deployments and rebuilds)
    DATA_DIR: process.env.DATA_DIR || '',
    UPLOADS_DIR: process.env.UPLOADS_DIR || ''
};
