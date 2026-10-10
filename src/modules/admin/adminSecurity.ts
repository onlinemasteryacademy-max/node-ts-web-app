import { dbFetchOne, dbInsert, dbUpdate, dbFetchAll } from '../../db/db.js';
import { hashPassword } from '../../utils/helpers.js';
import { logAdminAction } from './adminHelpers.js';
import { ENV } from '../../config/env.js';
import { FastifyReply } from 'fastify';

interface FailedAttempt {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil: number;
}

// In-Memory Rate Limiter Map (keyed by IP and Email)
const failedAttemptsMap = new Map<string, FailedAttempt>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Super Admin Provisioning & Credential Sync Engine
 */
export function initSuperAdminAccount(): void {
  try {
    const adminEmail = ENV.SUPER_ADMIN_EMAIL;
    const adminPass = ENV.SUPER_ADMIN_PASSWORD;
    const adminName = ENV.SUPER_ADMIN_NAME;
    const shouldReset = ENV.RESET_SUPER_ADMIN_PASSWORD;

    const existing = dbFetchOne<any>('super_admins', { email: adminEmail });

    if (!existing) {
      // Create master super admin
      const passHash = hashPassword(adminPass);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const newId = dbInsert('super_admins', {
        email: adminEmail,
        password_hash: passHash,
        name: adminName,
        role: 'super_admin',
        created_at: now
      });

      logAdminAction(newId, 'Provision Master Super Admin', 'super_admins', newId, `Master Super Admin account provisioned for ${adminEmail}`, '127.0.0.1');
      console.log(`🔒 [Security] Master Super Admin provisioned: ${adminEmail}`);
    } else if (shouldReset) {
      // Force password reset from environment
      const passHash = hashPassword(adminPass);
      dbUpdate('super_admins', { password_hash: passHash }, { id: existing.id });
      logAdminAction(existing.id, 'Super Admin Password Rotated', 'super_admins', existing.id, 'Password updated via environment configuration', '127.0.0.1');
      console.log(`🔒 [Security] Master Super Admin password rotated: ${adminEmail}`);
    }
  } catch (err) {
    console.error('⚠️ Failed to initialize super admin account:', err);
  }
}

/**
 * Check if an IP or Email is currently rate-limited
 */
export function checkAdminRateLimit(ip: string, email: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const now = Date.now();
  const keys = [ip, `email:${email.toLowerCase().trim()}`];

  for (const key of keys) {
    const record = failedAttemptsMap.get(key);
    if (!record) continue;

    // Check if currently locked out
    if (record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    // Clear stale window
    if (now - record.firstAttempt > WINDOW_MS) {
      failedAttemptsMap.delete(key);
    }
  }

  const record = failedAttemptsMap.get(ip);
  const remaining = record ? Math.max(0, MAX_ATTEMPTS - record.count) : MAX_ATTEMPTS;

  return { allowed: true, remainingAttempts: remaining, retryAfterSeconds: 0 };
}

/**
 * Record a failed admin login attempt
 */
export function recordFailedAdminLogin(ip: string, email: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const keys = [ip, `email:${email.toLowerCase().trim()}`];
  let locked = false;
  let retryAfterSeconds = 0;

  for (const key of keys) {
    let record = failedAttemptsMap.get(key);

    if (!record || (now - record.firstAttempt > WINDOW_MS)) {
      record = { count: 1, firstAttempt: now, lastAttempt: now, lockedUntil: 0 };
    } else {
      record.count += 1;
      record.lastAttempt = now;
    }

    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
      locked = true;
      retryAfterSeconds = Math.ceil(LOCKOUT_MS / 1000);
    }

    failedAttemptsMap.set(key, record);
  }

  // Log security alert on lockout
  if (locked) {
    try {
      dbInsert('admin_audit_logs', {
        admin_id: 0,
        admin_name: 'Security System',
        action: 'SECURITY ALERT: Admin Rate Limit Exceeded',
        target_type: 'super_admins',
        target_id: null,
        details: `Brute-force lockout triggered for email "${email}" from IP ${ip} after ${MAX_ATTEMPTS} failed attempts. Locked for 15 minutes.`,
        ip_address: ip,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
    } catch (e) {}
  }

  return { locked, retryAfterSeconds };
}

/**
 * Reset rate limit counters upon successful login
 */
export function resetAdminRateLimit(ip: string, email: string): void {
  failedAttemptsMap.delete(ip);
  failedAttemptsMap.delete(`email:${email.toLowerCase().trim()}`);
}

/**
 * Apply Strict Security Headers to Super Admin responses
 */
export function applyAdminSecurityHeaders(reply: FastifyReply): void {
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Content-Security-Policy', "frame-ancestors 'none';");
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
}
