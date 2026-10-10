"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.sendMerchantWelcomeEmail = sendMerchantWelcomeEmail;
exports.sendMerchantOrderAlertEmail = sendMerchantOrderAlertEmail;
exports.sendCustomerOrderConfirmationEmail = sendCustomerOrderConfirmationEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendAdminTestEmail = sendAdminTestEmail;
exports.sendEmailVerificationOtp = sendEmailVerificationOtp;
exports.sendBankAccountChangeOtp = sendBankAccountChangeOtp;
const nodemailer_1 = __importDefault(require("nodemailer"));
const db_js_1 = require("../../db/db.js");
/**
 * Universal Mailer & SMTP Transactional Engine
 */
async function sendEmail(payload) {
    const toEmail = (payload.toEmail || '').trim();
    const toName = (payload.toName || '').trim();
    const subject = payload.subject || 'Platform Notification';
    const htmlContent = payload.htmlContent;
    const templateName = payload.templateName || 'custom';
    if (!toEmail || !toEmail.includes('@')) {
        return { success: false, status: 'failed', error: 'Invalid recipient email address' };
    }
    const settings = (0, db_js_1.dbFetchOne)('platform_settings') || {};
    const smtpEnabled = process.env.SMTP_ENABLED !== undefined
        ? (process.env.SMTP_ENABLED === '1' || process.env.SMTP_ENABLED === 'true')
        : Boolean(settings.smtp_enabled);
    const smtpHost = (process.env.SMTP_HOST || settings.smtp_host || '').trim();
    const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : Number(settings.smtp_port || 465);
    const smtpEncryption = (process.env.SMTP_ENCRYPTION || settings.smtp_encryption || '').toLowerCase();
    const smtpUser = (process.env.SMTP_USERNAME || settings.smtp_username || '').trim();
    const smtpPass = (process.env.SMTP_PASSWORD || settings.smtp_password || '').trim();
    const fromEmail = (process.env.SMTP_FROM_EMAIL || settings.smtp_from_email || smtpUser || 'notifications@zlik.store').trim();
    const fromName = (process.env.SMTP_FROM_NAME || settings.smtp_from_name || 'Zlik').trim();
    const replyTo = (process.env.SMTP_REPLY_TO || settings.smtp_reply_to || fromEmail).trim();
    let status = 'logged_sandbox';
    let errorMessage = null;
    let messageId = undefined;
    if (smtpEnabled && smtpHost && smtpPass && smtpPass !== '') {
        try {
            const isSecure = smtpPort === 465 || smtpEncryption === 'ssl';
            const transporter = nodemailer_1.default.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: isSecure,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000
            });
            const info = await transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to: toName ? `"${toName}" <${toEmail}>` : toEmail,
                replyTo,
                subject,
                html: htmlContent,
                text: payload.plainText
            });
            status = 'sent';
            messageId = info.messageId;
        }
        catch (e) {
            errorMessage = e?.message || 'SMTP delivery failed';
            status = 'failed';
        }
    }
    else {
        status = 'logged_sandbox';
        errorMessage = !smtpEnabled
            ? 'Live SMTP disabled; email saved in sandbox logs'
            : 'SMTP password not configured; email saved in sandbox logs';
    }
    try {
        (0, db_js_1.dbInsert)('email_logs', {
            recipient_email: toEmail,
            recipient_name: toName,
            subject,
            template_name: templateName,
            status,
            error_message: errorMessage,
            sent_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        });
    }
    catch (e) { }
    return {
        success: status === 'sent' || status === 'logged_sandbox',
        status,
        error: errorMessage,
        messageId
    };
}
/**
 * Base email layout wrapper
 */
function emailLayout(title, bodyContent) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAF8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #08110D; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAF8; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E3E9E5; overflow: hidden; box-shadow: 0 4px 20px rgba(8,17,13,0.04);">
          <!-- Header -->
          <tr>
            <td style="background-color: #08110D; padding: 28px 36px; text-align: left;">
              <span style="font-size: 22px; font-weight: 800; color: #19D98B; letter-spacing: -0.5px;">zlik</span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAF8; padding: 20px 36px; border-top: 1px solid #E3E9E5; text-align: center; font-size: 12px; color: #6B756F;">
              Sent by Zlik Commerce Platform &bull; Empowering High-Velocity Social Sellers
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
/**
 * 1. Welcome Merchant Email
 */
async function sendMerchantWelcomeEmail(store) {
    const storeUrl = `https://${store.slug}.zlik.store`;
    const dashboardUrl = `https://zlik.store/merchant/login`;
    const html = emailLayout(`Welcome to Zlik, ${store.owner_name}!`, `
    <h2 style="font-size: 22px; font-weight: 700; color: #08110D; margin-top: 0;">Welcome aboard, ${store.owner_name}! 🚀</h2>
    <p style="font-size: 14px; color: #4B5563; margin-bottom: 24px;">Your digital storefront <strong>${store.store_name}</strong> is live and ready to take orders directly to your WhatsApp and bank account.</p>
    
    <div style="background-color: #F8FAF8; border: 1px solid #E3E9E5; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6B756F; margin-bottom: 8px;">Your Storefront Link:</div>
      <a href="${storeUrl}" style="font-size: 16px; font-weight: 700; color: #087A50; text-decoration: none;">${storeUrl}</a>
    </div>

    <p style="font-size: 14px; color: #4B5563;">Next steps to start making sales:</p>
    <ul style="font-size: 14px; color: #4B5563; padding-left: 20px; line-height: 1.8;">
      <li>Add your products & bank account details in Settings.</li>
      <li>Copy your store link and place it in your Instagram / TikTok bio.</li>
      <li>Share your catalog directly with customers on WhatsApp.</li>
    </ul>

    <div style="margin-top: 30px; text-align: center;">
      <a href="${dashboardUrl}" style="display: inline-block; background-color: #19D98B; color: #08110D; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Open Merchant Console &rarr;</a>
    </div>
    `);
    return sendEmail({
        toEmail: store.email,
        toName: store.owner_name,
        subject: `Welcome to Zlik - Your store ${store.store_name} is ready! 🎉`,
        htmlContent: html,
        templateName: 'merchant_welcome'
    });
}
/**
 * 2. Order Alert to Merchant
 */
async function sendMerchantOrderAlertEmail(store, order, items = []) {
    let itemsHtml = '';
    items.forEach(it => {
        itemsHtml += `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E3E9E5; font-size: 13px; color: #08110D;">${it.title || 'Product'} &times; ${it.qty || 1}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #E3E9E5; font-size: 13px; font-weight: 600; text-align: right; color: #08110D;">₦${Number(it.price || 0).toLocaleString()}</td>
      </tr>
    `;
    });
    const html = emailLayout(`New Order #${order.order_ref}`, `
    <div style="display: inline-block; padding: 4px 10px; background-color: #D4F7E6; color: #087A50; font-size: 12px; font-weight: 700; border-radius: 6px; margin-bottom: 12px;">NEW ORDER RECEIVED</div>
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">Order #${order.order_ref} - ₦${Number(order.total_amount || 0).toLocaleString()}</h2>
    <p style="font-size: 14px; color: #4B5563;">You received a new order from <strong>${order.customer_name}</strong> (${order.customer_phone}).</p>
    
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
      ${itemsHtml}
      <tr>
        <td style="padding: 12px 0; font-size: 14px; font-weight: 700; color: #08110D;">Total Amount</td>
        <td style="padding: 12px 0; font-size: 15px; font-weight: 800; text-align: right; color: #087A50;">₦${Number(order.total_amount || 0).toLocaleString()}</td>
      </tr>
    </table>

    <div style="margin-top: 24px;">
      <a href="https://zlik.store/merchant/messages" style="display: inline-block; background-color: #08110D; color: #FFFFFF; font-weight: 600; font-size: 13px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View Customer Chat & Order &rarr;</a>
    </div>
    `);
    return sendEmail({
        toEmail: store.email,
        toName: store.owner_name,
        subject: `🔔 New Order #${order.order_ref} from ${order.customer_name} (₦${Number(order.total_amount).toLocaleString()})`,
        htmlContent: html,
        templateName: 'merchant_order_alert'
    });
}
/**
 * 3. Customer Order Confirmation Email
 */
async function sendCustomerOrderConfirmationEmail(store, order, items = []) {
    if (!order.customer_email) {
        return { success: false, status: 'failed', error: 'No customer email provided' };
    }
    const trackerUrl = `https://zlik.store/order/${order.order_ref}`;
    const html = emailLayout(`Order Confirmation #${order.order_ref}`, `
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">Thank you for your order, ${order.customer_name}!</h2>
    <p style="font-size: 14px; color: #4B5563;">Your order with <strong>${store.store_name}</strong> has been received and is being processed.</p>
    
    <div style="background-color: #F8FAF8; border: 1px solid #E3E9E5; border-radius: 12px; padding: 18px; margin: 20px 0;">
      <div style="font-size: 12px; color: #6B756F;">Order Reference:</div>
      <div style="font-size: 16px; font-weight: 700; color: #08110D; margin-bottom: 12px;">#${order.order_ref}</div>
      <div style="font-size: 12px; color: #6B756F;">Total Amount:</div>
      <div style="font-size: 18px; font-weight: 800; color: #087A50;">₦${Number(order.total_amount).toLocaleString()}</div>
    </div>

    <div style="margin-top: 24px; text-align: center;">
      <a href="${trackerUrl}" style="display: inline-block; background-color: #19D98B; color: #08110D; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Track Order & Upload Payment Proof &rarr;</a>
    </div>
    `);
    return sendEmail({
        toEmail: order.customer_email,
        toName: order.customer_name,
        subject: `Order Confirmation #${order.order_ref} from ${store.store_name}`,
        htmlContent: html,
        templateName: 'customer_order_confirmation'
    });
}
/**
 * 4. Password Reset Email
 */
async function sendPasswordResetEmail(email, name, resetUrl, userType = 'merchant') {
    const html = emailLayout(`Reset Your Password`, `
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">Password Reset Request</h2>
    <p style="font-size: 14px; color: #4B5563;">Hello ${name}, we received a request to reset your password for your ${userType === 'admin' ? 'admin console' : 'merchant account'}.</p>
    <p style="font-size: 14px; color: #4B5563;">Click the button below to choose a new secure password. This link expires in 1 hour.</p>
    
    <div style="margin: 28px 0; text-align: center;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #19D98B; color: #08110D; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Reset Password &rarr;</a>
    </div>
    
    <p style="font-size: 12px; color: #6B756F;">If you did not request this, you can safely ignore this email. Your password will remain unchanged.</p>
    `);
    return sendEmail({
        toEmail: email,
        toName: name,
        subject: `Reset your ${userType === 'admin' ? 'Admin' : 'Zlik'} password`,
        htmlContent: html,
        templateName: 'password_reset'
    });
}
/**
 * 5. Admin Test Email
 */
async function sendAdminTestEmail(targetEmail) {
    const html = emailLayout('SMTP Configuration Test', `
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">SMTP Test Successful! 🚀</h2>
    <p style="font-size: 14px; color: #4B5563;">This is a test email sent from your Zlik Super Admin console to verify that the transactional mail server and socket connection are configured correctly.</p>
    <div style="background-color: #D4F7E6; border: 1px solid #19D98B; border-radius: 8px; padding: 12px 16px; margin-top: 20px; color: #087A50; font-weight: 600; font-size: 13px;">
      ✓ SMTP Connection and Socket Delivery are operating normally.
    </div>
    `);
    return sendEmail({
        toEmail: targetEmail,
        toName: 'Platform Administrator',
        subject: '🧪 SMTP Configuration Test - Zlik Super Admin',
        htmlContent: html,
        templateName: 'smtp_test'
    });
}
/**
 * 6. Email Verification OTP Code
 */
async function sendEmailVerificationOtp(email, name, otpCode, verifyUrl) {
    const safeName = name?.trim() || 'Merchant';
    const magicLinkBtn = verifyUrl
        ? `
    <div style="margin: 24px 0 16px 0; text-align: center;">
      <a href="${verifyUrl}" style="display: inline-block; background-color: #19D98B; color: #08110D; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; text-decoration: none;">Verify Email Address &rarr;</a>
    </div>
    <p style="font-size: 12px; color: #6B756F; text-align: center;">Or enter the 6-digit code in the registration window:</p>
  `
        : '';
    const html = emailLayout('Confirm your email address', `
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">Verify Your Email Address</h2>
    <p style="font-size: 14px; color: #4B5563;">Hello <strong>${safeName}</strong>, thank you for signing up with Zlik. Use the verification code below to confirm your email and complete your store setup:</p>
    
    <div style="background-color: #08110D; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #19D98B; letter-spacing: 1px; margin-bottom: 8px;">6-DIGIT VERIFICATION CODE</div>
      <div style="font-size: 36px; font-weight: 800; color: #FFFFFF; letter-spacing: 8px; font-family: monospace;">${otpCode}</div>
      <div style="font-size: 12px; color: #9CA3AF; margin-top: 8px;">Valid for the next 5 minutes</div>
    </div>

    ${magicLinkBtn}

    <p style="font-size: 12px; color: #6B756F; margin-top: 20px; line-height: 1.5;">
      If you did not initiate this store registration, please ignore this email. No store will be created without verifying this code.
    </p>
    `);
    return sendEmail({
        toEmail: email,
        toName: safeName,
        subject: `Your Zlik Verification Code: ${otpCode}`,
        htmlContent: html,
        templateName: 'email_verification_otp'
    });
}
/**
 * 7. Bank Account Change Security Authorization OTP
 */
async function sendBankAccountChangeOtp(email, storeName, otpCode, bankName, accountNumber) {
    const safeName = storeName?.trim() || 'Store Owner';
    const maskedAcct = accountNumber ? accountNumber.replace(/\d(?=\d{4})/g, '*') : '••••';
    const html = emailLayout('Authorize Payout Bank Account Change', `
    <h2 style="font-size: 20px; font-weight: 700; color: #08110D; margin-top: 0;">Security Alert: Bank Account Change</h2>
    <p style="font-size: 14px; color: #4B5563;">Hello <strong>${safeName}</strong>, a request was made to update the payout bank account details for your Zlik store to:</p>
    
    <div style="background-color: #F8FAF8; border: 1px solid #E3E9E5; border-radius: 10px; padding: 14px 18px; margin: 16px 0; font-size: 13px; color: #08110D;">
      <div><strong>Bank:</strong> ${bankName || 'Not Specified'}</div>
      <div style="margin-top: 4px;"><strong>Account Number:</strong> <span style="font-family: monospace; font-weight: bold;">${maskedAcct}</span></div>
    </div>

    <p style="font-size: 14px; color: #4B5563;">To approve and complete this bank account change, enter the 6-digit authorization code in your settings window:</p>

    <div style="background-color: #08110D; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #19D98B; letter-spacing: 1px; margin-bottom: 8px;">AUTHORIZATION CODE</div>
      <div style="font-size: 36px; font-weight: 800; color: #FFFFFF; letter-spacing: 8px; font-family: monospace;">${otpCode}</div>
      <div style="font-size: 12px; color: #9CA3AF; margin-top: 8px;">Valid for 5 minutes</div>
    </div>

    <p style="font-size: 12px; color: #DC2626; font-weight: 600; margin-top: 16px;">
      ⚠️ If you did not initiate this change, DO NOT share this code with anyone. Your payout details remain safe and unchanged.
    </p>
    `);
    return sendEmail({
        toEmail: email,
        toName: safeName,
        subject: `Security Alert: Authorize Bank Account Change (${otpCode})`,
        htmlContent: html,
        templateName: 'bank_account_change_otp'
    });
}
