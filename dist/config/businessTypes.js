"use strict";
/**
 * Business Types & Template Customization Definitions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUSINESS_TYPES = void 0;
exports.BUSINESS_TYPES = {
    retail: {
        name: 'Retail & Supermarket',
        category: 'retail',
        icon: '🛒',
        accent_color: '#087A50',
        accent_bg: '#EAF7F0',
        product_label_singular: 'Product',
        product_label_plural: 'Products',
        supports_variants: true,
        supports_addons: false,
        supports_table_booking: false,
        default_fulfillment: 'both',
        recommended_templates: ['modern_grid', 'clean_minimal']
    },
    food: {
        name: 'Restaurant, Food & Bakery',
        category: 'food',
        icon: '🍔',
        accent_color: '#D97706',
        accent_bg: '#FEF3C7',
        product_label_singular: 'Dish / Meal',
        product_label_plural: 'Menu Items',
        supports_variants: true,
        supports_addons: true,
        supports_table_booking: true,
        default_fulfillment: 'both',
        recommended_templates: ['restaurant_menu', 'warm_bistro']
    },
    fashion: {
        name: 'Fashion, Apparel & Beauty',
        category: 'fashion',
        icon: '👗',
        accent_color: '#BE185D',
        accent_bg: '#FCE7F3',
        product_label_singular: 'Item',
        product_label_plural: 'Collection',
        supports_variants: true,
        supports_addons: false,
        supports_table_booking: false,
        default_fulfillment: 'delivery',
        recommended_templates: ['fashion_lookbook', 'luxury_boutique']
    },
    electronics: {
        name: 'Electronics, Phones & Gadgets',
        category: 'electronics',
        icon: '⚡',
        accent_color: '#2563EB',
        accent_bg: '#DBEAFE',
        product_label_singular: 'Device',
        product_label_plural: 'Devices & Gadgets',
        supports_variants: true,
        supports_addons: false,
        supports_table_booking: false,
        default_fulfillment: 'delivery',
        recommended_templates: ['tech_showcase', 'modern_grid']
    },
    digital: {
        name: 'Digital Products & Courses',
        category: 'digital',
        icon: '📱',
        accent_color: '#7C3AED',
        accent_bg: '#EDE9FE',
        product_label_singular: 'Digital Item',
        product_label_plural: 'Digital Downloads',
        supports_variants: false,
        supports_addons: false,
        supports_table_booking: false,
        default_fulfillment: 'delivery',
        recommended_templates: ['digital_creator', 'clean_minimal']
    },
    services: {
        name: 'Services & Bookings',
        category: 'services',
        icon: '💼',
        accent_color: '#0D9488',
        accent_bg: '#CCFBF1',
        product_label_singular: 'Service',
        product_label_plural: 'Services',
        supports_variants: false,
        supports_addons: true,
        supports_table_booking: true,
        default_fulfillment: 'pickup',
        recommended_templates: ['professional_services', 'clean_minimal']
    }
};
