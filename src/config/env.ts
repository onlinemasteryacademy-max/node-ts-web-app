import fs from 'node:fs';
import path from 'node:path';

/**
 * Universal Environment Loader
 * Loads .env file into process.env if present
 */
export function loadEnv(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'node-ts-web-app', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(__dirname, '..', '.env')
  ];

  const envPath = candidatePaths.find(p => fs.existsSync(p));
  if (!envPath) return;

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.warn('⚠️ Warning: Failed to load .env file:', err);
  }
}

// Automatically load on import
loadEnv();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: (process.env.NODE_ENV || '').toLowerCase() === 'production',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  SESSION_SECRET: process.env.SESSION_SECRET || 'zlik_super_secure_production_secret_key_98374298734982739847239847293847!',
  SUPER_ADMIN_EMAIL: (process.env.SUPER_ADMIN_EMAIL || 'admin@zlik.store').toLowerCase().trim(),
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || 'Zlik#Admin!2026@Security',
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || 'Platform Super Administrator',
  ADMIN_SECRET_PATH: (process.env.ADMIN_SECRET_PATH || 'zlik-ops-9x7q2m8b').replace(/^\/+|\/+$/g, ''),
  RESET_SUPER_ADMIN_PASSWORD: process.env.RESET_SUPER_ADMIN_PASSWORD === 'true'
};
