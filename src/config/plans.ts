/**
 * Centralized Plan Configuration & Limits
 * Official Zlik Tier Matrix (Free, Pro, Business)
 */

export interface PlanFeatureConfig {
  name: string;
  tagline: string;
  price_monthly: number;
  price_yearly: number;
  price_formatted: string;
  price_yearly_formatted: string;
  billing_badge: string;
  badge_label: string;
  badge_color: string;
  limits: {
    max_stores: number;
    max_products: number; // -1 = unlimited
    photos_per_product: number;
    storefront_designs: number; // 5 for free (1 per category), 15 for pro/business
    sales_ledger_days: number; // 7 = last 7 days, -1 = lifetime history
    active_debts_limit: number; // 3 for free, -1 = unlimited
    staff_accounts: number; // 0 for free, 1 for pro, 5 for business
    max_delivery_zones: number;
    max_active_orders: number;
    live_chat_monthly_conversations: number; // 20 for free, -1 = unlimited
  };
  features: {
    powered_by_zlik: boolean; // true = watermark included, false = removed
    custom_domain: boolean;
    whatsapp_orders_online_checkout: boolean;
    basic_order_management: boolean;
    full_order_management: boolean;
    core_live_chat_persistent_history: boolean;
    live_customer_tracking: boolean;
    branch_analytics: boolean;
    basic_customer_records: boolean;
    store_product_sharing_seo_qr: boolean;
    pixels_integration: boolean; // Meta Pixel, Google Ads, TikTok Pixel
    unlimited_status_posters: boolean;
    whatsapp_daily_autoposter: boolean;
    customer_broadcasts_discounts_bundles_preorders: boolean;
    marketplace_listings_discovery: boolean;
    customer_reviews_verification_eligibility: boolean;
    brand_color_logo_controls: boolean;
    order_notification_sound_library: boolean;
    custom_audio_alerts: boolean;
    seller_branded_receipts: boolean;
    custom_receipt_templates: boolean;
    full_sales_ledger_export: boolean;
    daily_sales_summary_whatsapp: boolean;
    unlimited_debts_whatsapp_reminders: boolean;
    stock_tracking_low_stock_alerts: boolean;
    bulk_product_import: boolean; // CSV/Excel
    advanced_bulk_import_image_matching: boolean;
    sales_reports_by_staff_branch_product: boolean;
    daily_sales_summary_by_branch_staff: boolean;
    debt_reminders_staff_access: boolean;
    branch_level_inventory: boolean;
    staff_roles_permissions: boolean;
    audit_logs_multi_store_reporting: boolean;
    whatsapp_support: boolean;
    priority_support_onboarding: boolean;
  };
}

export const PLANS: Record<string, PlanFeatureConfig> = {
  free: {
    name: 'Free',
    tagline: 'For merchants getting started and building their customer base.',
    price_monthly: 0,
    price_yearly: 0,
    price_formatted: '₦0',
    price_yearly_formatted: '₦0/forever',
    billing_badge: 'forever',
    badge_label: 'Free',
    badge_color: 'bg-gray-100 text-gray-700',
    limits: {
      max_stores: 1,
      max_products: 10,
      photos_per_product: 1,
      storefront_designs: 5, // 1 per category
      sales_ledger_days: 7,
      active_debts_limit: 3,
      staff_accounts: 0,
      max_delivery_zones: 3,
      max_active_orders: 50,
      live_chat_monthly_conversations: 20
    },
    features: {
      powered_by_zlik: true, // Includes "Powered by Zlik" attribution
      custom_domain: false,
      whatsapp_orders_online_checkout: true,
      basic_order_management: true,
      full_order_management: false,
      core_live_chat_persistent_history: true,
      live_customer_tracking: false,
      branch_analytics: false,
      basic_customer_records: true,
      store_product_sharing_seo_qr: true,
      pixels_integration: true,
      unlimited_status_posters: true,
      whatsapp_daily_autoposter: true,
      customer_broadcasts_discounts_bundles_preorders: true,
      marketplace_listings_discovery: true,
      customer_reviews_verification_eligibility: true,
      brand_color_logo_controls: false,
      order_notification_sound_library: false,
      custom_audio_alerts: false,
      seller_branded_receipts: false,
      custom_receipt_templates: false,
      full_sales_ledger_export: false,
      daily_sales_summary_whatsapp: false,
      unlimited_debts_whatsapp_reminders: false,
      stock_tracking_low_stock_alerts: false,
      bulk_product_import: false,
      advanced_bulk_import_image_matching: false,
      sales_reports_by_staff_branch_product: false,
      daily_sales_summary_by_branch_staff: false,
      debt_reminders_staff_access: false,
      branch_level_inventory: false,
      staff_roles_permissions: false,
      audit_logs_multi_store_reporting: false,
      whatsapp_support: false,
      priority_support_onboarding: false
    }
  },

  pro: {
    name: 'Pro',
    tagline: 'For established sellers who need better control and more capacity.',
    price_monthly: 5000,
    price_yearly: 50000,
    price_formatted: '₦5,000/mo',
    price_yearly_formatted: '₦50,000/yr — save ₦10,000',
    billing_badge: 'Recommended',
    badge_label: 'PRO',
    badge_color: 'bg-[#19D98B]/20 text-[#087A50] border border-[#19D98B]/30 font-bold',
    limits: {
      max_stores: 3,
      max_products: 500,
      photos_per_product: 5,
      storefront_designs: 15, // All 15 designs
      sales_ledger_days: -1, // Full lifetime history
      active_debts_limit: -1, // Unlimited
      staff_accounts: 1, // 1 additional staff account
      max_delivery_zones: -1,
      max_active_orders: -1,
      live_chat_monthly_conversations: -1 // Unlimited
    },
    features: {
      powered_by_zlik: false, // Watermark removed
      custom_domain: false,
      whatsapp_orders_online_checkout: true,
      basic_order_management: true,
      full_order_management: true,
      core_live_chat_persistent_history: true,
      live_customer_tracking: true,
      branch_analytics: false,
      basic_customer_records: true,
      store_product_sharing_seo_qr: true,
      pixels_integration: true,
      unlimited_status_posters: true,
      whatsapp_daily_autoposter: true,
      customer_broadcasts_discounts_bundles_preorders: true,
      marketplace_listings_discovery: true,
      customer_reviews_verification_eligibility: true,
      brand_color_logo_controls: true,
      order_notification_sound_library: true,
      custom_audio_alerts: true,
      seller_branded_receipts: true,
      custom_receipt_templates: false,
      full_sales_ledger_export: true,
      daily_sales_summary_whatsapp: true,
      unlimited_debts_whatsapp_reminders: true,
      stock_tracking_low_stock_alerts: true,
      bulk_product_import: true,
      advanced_bulk_import_image_matching: false,
      sales_reports_by_staff_branch_product: false,
      daily_sales_summary_by_branch_staff: false,
      debt_reminders_staff_access: false,
      branch_level_inventory: false,
      staff_roles_permissions: false,
      audit_logs_multi_store_reporting: false,
      whatsapp_support: true,
      priority_support_onboarding: false
    }
  },

  business: {
    name: 'Business',
    tagline: 'For growing businesses managing employees, branches and more complex operations.',
    price_monthly: 9000,
    price_yearly: 90000,
    price_formatted: '₦9,000/mo',
    price_yearly_formatted: '₦90,000/yr — save ₦18,000',
    billing_badge: 'Enterprise Growth',
    badge_label: 'BUSINESS',
    badge_color: 'bg-[#08110D] text-[#19D98B] border border-[#19D98B]/40 font-bold',
    limits: {
      max_stores: 10,
      max_products: -1, // Unlimited
      photos_per_product: 10, // 10 photos + video
      storefront_designs: 15, // All 15 designs + custom colors, fonts & banners
      sales_ledger_days: -1,
      active_debts_limit: -1,
      staff_accounts: 5, // 5 additional staff accounts
      max_delivery_zones: -1,
      max_active_orders: -1,
      live_chat_monthly_conversations: -1 // Unlimited
    },
    features: {
      powered_by_zlik: false,
      custom_domain: true,
      whatsapp_orders_online_checkout: true,
      basic_order_management: true,
      full_order_management: true,
      core_live_chat_persistent_history: true,
      live_customer_tracking: true,
      branch_analytics: true,
      basic_customer_records: true,
      store_product_sharing_seo_qr: true,
      pixels_integration: true,
      unlimited_status_posters: true,
      whatsapp_daily_autoposter: true,
      customer_broadcasts_discounts_bundles_preorders: true,
      marketplace_listings_discovery: true,
      customer_reviews_verification_eligibility: true,
      brand_color_logo_controls: true,
      order_notification_sound_library: true,
      custom_audio_alerts: true,
      seller_branded_receipts: true,
      custom_receipt_templates: true,
      full_sales_ledger_export: true,
      daily_sales_summary_whatsapp: true,
      unlimited_debts_whatsapp_reminders: true,
      stock_tracking_low_stock_alerts: true,
      bulk_product_import: true,
      advanced_bulk_import_image_matching: true,
      sales_reports_by_staff_branch_product: true,
      daily_sales_summary_by_branch_staff: true,
      debt_reminders_staff_access: true,
      branch_level_inventory: true,
      staff_roles_permissions: true,
      audit_logs_multi_store_reporting: true,
      whatsapp_support: true,
      priority_support_onboarding: true
    }
  },

  enterprise: {
    name: 'Enterprise Custom',
    tagline: 'Custom high-volume architecture, multi-brand hubs and bespoke integrations.',
    price_monthly: 0,
    price_yearly: 0,
    price_formatted: 'Custom Pricing',
    price_yearly_formatted: 'Custom Pricing',
    billing_badge: 'Custom Contract',
    badge_label: 'ENTERPRISE',
    badge_color: 'bg-purple-100 text-purple-800 border border-purple-300 font-bold',
    limits: {
      max_stores: -1,
      max_products: -1,
      photos_per_product: 20,
      storefront_designs: 15,
      sales_ledger_days: -1,
      active_debts_limit: -1,
      staff_accounts: -1,
      max_delivery_zones: -1,
      max_active_orders: -1,
      live_chat_monthly_conversations: -1
    },
    features: {
      powered_by_zlik: false,
      custom_domain: true,
      whatsapp_orders_online_checkout: true,
      basic_order_management: true,
      full_order_management: true,
      core_live_chat_persistent_history: true,
      live_customer_tracking: true,
      branch_analytics: true,
      basic_customer_records: true,
      store_product_sharing_seo_qr: true,
      pixels_integration: true,
      unlimited_status_posters: true,
      whatsapp_daily_autoposter: true,
      customer_broadcasts_discounts_bundles_preorders: true,
      marketplace_listings_discovery: true,
      customer_reviews_verification_eligibility: true,
      brand_color_logo_controls: true,
      order_notification_sound_library: true,
      custom_audio_alerts: true,
      seller_branded_receipts: true,
      custom_receipt_templates: true,
      full_sales_ledger_export: true,
      daily_sales_summary_whatsapp: true,
      unlimited_debts_whatsapp_reminders: true,
      stock_tracking_low_stock_alerts: true,
      bulk_product_import: true,
      advanced_bulk_import_image_matching: true,
      sales_reports_by_staff_branch_product: true,
      daily_sales_summary_by_branch_staff: true,
      debt_reminders_staff_access: true,
      branch_level_inventory: true,
      staff_roles_permissions: true,
      audit_logs_multi_store_reporting: true,
      whatsapp_support: true,
      priority_support_onboarding: true
    }
  }
};

export interface FeatureDefinition {
  key: string;
  name: string;
  description: string;
  category: 'Branding & Storefront' | 'Catalog & Inventory' | 'Sales, Ledger & Debts' | 'Marketing, Pixels & Growth' | 'Teams, Multi-Store & Branches' | 'Support & Onboarding';
}

export const PLATFORM_FEATURE_DEFINITIONS: FeatureDefinition[] = [
  // 1. Branding & Storefront
  { key: 'powered_by_zlik', name: 'Zlik Watermark Attribution', description: 'Show "Powered by Zlik" watermark on storefront footer', category: 'Branding & Storefront' },
  { key: 'brand_color_logo_controls', name: 'Custom Brand Colors & Logo', description: 'Customize store accent color palette and logo branding', category: 'Branding & Storefront' },
  { key: 'order_notification_sound_library', name: 'Audio Notification Sound Library', description: 'Access to sound library (chime, bell, cash register, arcade)', category: 'Branding & Storefront' },
  { key: 'custom_audio_alerts', name: 'Custom Audio Alert Upload', description: 'Upload custom MP3 audio file for new order chimes', category: 'Branding & Storefront' },
  { key: 'seller_branded_receipts', name: 'Branded Order Receipts', description: 'Generate order receipts with seller logo and custom note', category: 'Branding & Storefront' },
  { key: 'custom_receipt_templates', name: 'Thermal & POS Receipt Templates', description: 'Format receipts for 58mm/80mm thermal POS printers', category: 'Branding & Storefront' },
  { key: 'custom_domain', name: 'Custom Domain & DNS Mapping', description: 'Connect external custom domain (e.g. brand.com) with SSL', category: 'Branding & Storefront' },

  // 2. Catalog & Inventory
  { key: 'whatsapp_orders_online_checkout', name: 'WhatsApp & Online Checkout', description: 'Order directly on WhatsApp or pay online with instant confirmation', category: 'Catalog & Inventory' },
  { key: 'basic_order_management', name: 'Core Order Management', description: 'View, accept, and manage customer orders', category: 'Catalog & Inventory' },
  { key: 'full_order_management', name: 'Advanced Order Status Workflow', description: 'Manage complete order dispatch, transit, and fulfillment status', category: 'Catalog & Inventory' },
  { key: 'stock_tracking_low_stock_alerts', name: 'Inventory & Low-Stock Alerts', description: 'Track product stock quantities and receive low-stock alerts', category: 'Catalog & Inventory' },
  { key: 'bulk_product_import', name: 'Bulk CSV / Excel Product Import', description: 'Import entire product catalog using CSV spreadsheet upload', category: 'Catalog & Inventory' },
  { key: 'advanced_bulk_import_image_matching', name: 'Advanced Bulk Import & Image Matching', description: 'Automated bulk product matching with zip media upload', category: 'Catalog & Inventory' },

  // 3. Sales, Ledger & Debts
  { key: 'full_sales_ledger_export', name: 'Sales Ledger CSV Export', description: 'Export complete transaction history & financial ledger to CSV', category: 'Sales, Ledger & Debts' },
  { key: 'daily_sales_summary_whatsapp', name: 'Daily 9PM WhatsApp Sales Recap', description: 'Automated 9:00 PM WhatsApp recap of daily orders and gross sales', category: 'Sales, Ledger & Debts' },
  { key: 'unlimited_debts_whatsapp_reminders', name: 'Unlimited Debts & WhatsApp Reminders', description: 'Track customer debt balances and dispatch formatted WhatsApp reminders', category: 'Sales, Ledger & Debts' },
  { key: 'sales_reports_by_staff_branch_product', name: 'Granular Sales Reports', description: 'Segment revenue reports by staff member, branch location, or product', category: 'Sales, Ledger & Debts' },
  { key: 'daily_sales_summary_by_branch_staff', name: 'Branch & Staff Daily Sales Recap', description: 'Segregated daily sales summaries per physical store branch', category: 'Sales, Ledger & Debts' },

  // 4. Marketing, Pixels & Growth
  { key: 'core_live_chat_persistent_history', name: 'Live Chat & Persistent History', description: 'Real-time customer-to-merchant chat with persistent conversation history', category: 'Marketing, Pixels & Growth' },
  { key: 'basic_customer_records', name: 'Customer Directory & VIP Spend Tracking', description: 'Track customer purchase history, totals spent, and VIP tier', category: 'Marketing, Pixels & Growth' },
  { key: 'store_product_sharing_seo_qr', name: 'SEO, QR Codes & Social Sharing', description: 'Generate QR codes and social meta tags for fast product promotion', category: 'Marketing, Pixels & Growth' },
  { key: 'pixels_integration', name: 'Tracking Pixels (Meta, Google, TikTok)', description: 'Integrate Meta Pixel, Google Tag Manager/GA4, and TikTok Pixel', category: 'Marketing, Pixels & Growth' },
  { key: 'unlimited_status_posters', name: 'Marketing Poster Generator', description: 'Generate branded status posters for WhatsApp and Instagram', category: 'Marketing, Pixels & Growth' },
  { key: 'whatsapp_daily_autoposter', name: 'WhatsApp Daily Autoposter', description: '1-click automated daily product showcase posters', category: 'Marketing, Pixels & Growth' },
  { key: 'customer_broadcasts_discounts_bundles_preorders', name: 'Coupons, Pre-Orders & Broadcasts', description: 'Create coupon codes, pre-order products, and broadcast WhatsApp promos', category: 'Marketing, Pixels & Growth' },
  { key: 'marketplace_listings_discovery', name: 'Public Marketplace Listing', description: 'Display store in public Zlik merchant directory (/marketplace)', category: 'Marketing, Pixels & Growth' },
  { key: 'customer_reviews_verification_eligibility', name: 'Verified Customer Reviews & Badge', description: 'Collect star ratings and qualify for verified merchant badge', category: 'Marketing, Pixels & Growth' },

  // 5. Teams, Multi-Store & Branches
  { key: 'debt_reminders_staff_access', name: 'Staff Debt Tracker Access', description: 'Permit designated staff members to manage customer credit', category: 'Teams, Multi-Store & Branches' },
  { key: 'branch_level_inventory', name: 'Multi-Branch Inventory Allocation', description: 'Track and allocate physical stock across multiple branch stores', category: 'Teams, Multi-Store & Branches' },
  { key: 'staff_roles_permissions', name: 'Staff Roles & Granular Permissions', description: 'Role-based access controls (Cashier, Manager, Dispatch)', category: 'Teams, Multi-Store & Branches' },
  { key: 'audit_logs_multi_store_reporting', name: 'Multi-Store Centralized Reporting', description: 'Manage multiple storefronts under a single merchant account', category: 'Teams, Multi-Store & Branches' },

  // 6. Support & Onboarding
  { key: 'whatsapp_support', name: 'Dedicated WhatsApp Support', description: 'Priority merchant customer support via WhatsApp', category: 'Support & Onboarding' },
  { key: 'priority_support_onboarding', name: 'Priority VIP Support & 1-on-1 Onboarding', description: 'Dedicated account manager and accelerated onboarding', category: 'Support & Onboarding' }
];
