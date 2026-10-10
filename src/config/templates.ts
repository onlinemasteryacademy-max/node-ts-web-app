/**
 * Zlik Storefront Templates Architecture
 * 5 Industry Categories x 3 Templates Per Category (1 Free, 2 Pro) = 15 Specialized Templates
 */

export interface StoreCategoryConfig {
  id: 'general' | 'fashion' | 'food' | 'beauty' | 'electronics';
  name: string;
  tagline: string;
  icon: string;
  accent_color: string;
  accent_bg: string;
}

export interface StoreTemplateConfig {
  id: string;
  category_id: 'general' | 'fashion' | 'food' | 'beauty' | 'electronics';
  name: string;
  category: string;
  is_pro: boolean;
  tier_badge: 'FREE' | 'PRO';
  tagline: string;
  description: string;
  badge: string;
  icon: string;
  accent_color: string;
  accent_bg: string;
  hero_headline: string;
  hero_subheading: string;
  product_label_singular: string;
  product_label_plural: string;
  features: string[];
  preview_image?: string;
  banner_style: 'standard_clean' | 'cover_clean' | 'cover_overlay_cta';
  default_cover_image?: string;
  default_overlay_color?: string;
  cta_button_text?: string;
  supports_variants: boolean;
  supports_option_groups: boolean;
  supports_specs: boolean;
  supports_attributes: boolean;
  sample_categories: string[];
}

export const STORE_CATEGORIES: Record<string, StoreCategoryConfig> = {
  general: {
    id: 'general',
    name: 'General Store',
    tagline: 'Multi-category retail, gifts, home essentials & mixed inventory',
    icon: '🛒',
    accent_color: '#087A50',
    accent_bg: '#EAF7F0'
  },
  fashion: {
    id: 'fashion',
    name: 'Fashion & Apparel',
    tagline: 'Clothing, boutiques, footwear, bags, jewelry & accessories',
    icon: '👗',
    accent_color: '#BE185D',
    accent_bg: '#FCE7F3'
  },
  food: {
    id: 'food',
    name: 'Food & Restaurant',
    tagline: 'Restaurants, kitchens, fast food, bakeries, cafes & caterers',
    icon: '🍔',
    accent_color: '#D97706',
    accent_bg: '#FEF3C7'
  },
  beauty: {
    id: 'beauty',
    name: 'Beauty & Personal Care',
    tagline: 'Skincare, cosmetics, makeup, haircare, fragrances & wellness',
    icon: '✨',
    accent_color: '#9333EA',
    accent_bg: '#F3E8FF'
  },
  electronics: {
    id: 'electronics',
    name: 'Electronics & Gadgets',
    tagline: 'Smartphones, laptops, audio, gaming gear & smart accessories',
    icon: '⚡',
    accent_color: '#2563EB',
    accent_bg: '#DBEAFE'
  }
};

export const STORE_TEMPLATES: Record<string, StoreTemplateConfig> = {
  // -------------------------------------------------------------
  // 1. GENERAL STORE CATEGORY (1 Free, 2 Pro)
  // -------------------------------------------------------------
  general_clean: {
    id: 'general_clean',
    category_id: 'general',
    name: 'Classic Grid',
    category: 'General Retail',
    is_pro: false,
    tier_badge: 'FREE',
    tagline: 'Versatile product grid with instant search & fast checkout',
    description: 'Clean and practical layout suited for multi-category sellers, household items, and standard catalog products.',
    badge: 'Standard Starter',
    icon: '🛒',
    accent_color: '#087A50',
    accent_bg: '#EAF7F0',
    hero_headline: 'Curated Essentials & Everyday Favorites',
    hero_subheading: 'Browse our complete catalog and order directly for fast delivery.',
    product_label_singular: 'Product',
    product_label_plural: 'Products',
    features: [
      'Fast product search & category chips',
      'Discount badges & strikethrough pricing',
      'Instant 1-click cart and checkout'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'standard_clean',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Best Sellers', 'New Arrivals', 'Home & Living', 'Gifts']
  },

  general_modern: {
    id: 'general_modern',
    category_id: 'general',
    name: 'Modern Showcase',
    category: 'General Retail',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Hero spotlight banner with single full cover image without button clutter',
    description: 'Elevated commerce design with high-impact hero photography cover, sleek minimalist visual presentation, and priority showcase.',
    badge: 'Pro Showcase',
    icon: '🛍️',
    accent_color: '#059669',
    accent_bg: '#ECFDF5',
    hero_headline: 'Premium Retail & Exclusive Collections',
    hero_subheading: 'Discover top-rated selections with guaranteed quick dispatch and verified payment.',
    product_label_singular: 'Product',
    product_label_plural: 'Featured Products',
    features: [
      'Full-bleed single cover image banner',
      'Minimalist image-first header',
      'Strikethrough discount flash badges'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_clean',
    default_cover_image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&h=650&q=80',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Trending Now', 'Featured', 'Daily Deals', 'Essentials']
  },

  general_minimal: {
    id: 'general_minimal',
    category_id: 'general',
    name: 'Minimalist Boutique',
    category: 'General Retail',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Monochrome luxury aesthetic with dark overlay hero & aesthetic call-to-action',
    description: 'High-end minimalist aesthetic with customizable dark overlay cover banner, white headline typography, and aesthetic CTA button.',
    badge: 'Pro Boutique',
    icon: '🏷️',
    accent_color: '#18181B',
    accent_bg: '#F4F4F5',
    hero_headline: 'Simplicity & Quality in Every Detail',
    hero_subheading: 'Carefully selected goods crafted for everyday modern living.',
    product_label_singular: 'Item',
    product_label_plural: 'Curated Items',
    features: [
      'Cover image with customizable dark overlay',
      'White headline & aesthetic CTA button',
      'Ultra-fast direct order triggers'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_overlay_cta',
    default_cover_image: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&h=650&q=80',
    default_overlay_color: '#08110D',
    cta_button_text: 'Explore Curated Goods ↓',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Curated', 'New Arrivals', 'Signature Goods']
  },

  // -------------------------------------------------------------
  // 2. FASHION & APPAREL CATEGORY (1 Free, 2 Pro)
  // -------------------------------------------------------------
  fashion_lookbook: {
    id: 'fashion_lookbook',
    category_id: 'fashion',
    name: 'Editorial Lookbook',
    category: 'Fashion & Apparel',
    is_pro: false,
    tier_badge: 'FREE',
    tagline: 'Clean apparel grid with interactive size pills & color swatches',
    description: 'For fashion brands and boutiques selling clothing with standard size (XS-3XL) and color choices.',
    badge: 'Lookbook Starter',
    icon: '👗',
    accent_color: '#BE185D',
    accent_bg: '#FCE7F3',
    hero_headline: 'Curated Apparel & Timeless Style',
    hero_subheading: 'Explore our latest collection. Select your exact size and color combination.',
    product_label_singular: 'Item',
    product_label_plural: 'Collection Items',
    features: [
      'Interactive Size Selector (XS to 3XL)',
      'Visual Color Swatch circles',
      'Purchasable size/color combination matrix'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'standard_clean',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'New In', 'Tops & Shirts', 'Dresses', 'Trousers', 'Footwear']
  },

  fashion_runway: {
    id: 'fashion_runway',
    category_id: 'fashion',
    name: 'Runway Studio',
    category: 'Fashion & Apparel',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'High-fashion luxury look with single full cover image without button clutter',
    description: 'Editorial boutique presentation with high-impact runway photography cover, fabric composition tabs, care instructions, and variant pricing.',
    badge: 'Pro Runway',
    icon: '👠',
    accent_color: '#9D174D',
    accent_bg: '#FDF2F8',
    hero_headline: 'Haute Couture & Modern Wardrobe',
    hero_subheading: 'Statement silhouettes and artisanal fabrics designed to turn heads.',
    product_label_singular: 'Piece',
    product_label_plural: 'Runway Pieces',
    features: [
      'Single high-fashion cover image banner',
      'Minimalist image-first header',
      'Dynamic size/color pricing overrides'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_clean',
    default_cover_image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&h=650&q=80',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'Lookbook Vol. 1', 'Evening Wear', 'Outerwear', 'Footwear']
  },

  fashion_streetwear: {
    id: 'fashion_streetwear',
    category_id: 'fashion',
    name: 'Streetwear Hub',
    category: 'Fashion & Apparel',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Bold high-contrast aesthetic with dark overlay hero & aesthetic call-to-action',
    description: 'Urban streetwear storefront with customizable dark overlay cover banner, white headline typography, drop tags, and aesthetic CTA button.',
    badge: 'Pro Streetwear',
    icon: '🧢',
    accent_color: '#E11D48',
    accent_bg: '#FFE4E6',
    hero_headline: 'Limited Drops & Urban Streetwear',
    hero_subheading: 'Exclusive streetwear pieces. Secure your size before inventory runs out.',
    product_label_singular: 'Drop Item',
    product_label_plural: 'Drop Releases',
    features: [
      'Cover image with customizable dark overlay',
      'White headline & aesthetic CTA button',
      'Limited drop badges & oversized fit tags'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_overlay_cta',
    default_cover_image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1600&h=650&q=80',
    default_overlay_color: '#08110D',
    cta_button_text: 'Shop Latest Drop ↓',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'Drop 01', 'Hoodies & Sweats', 'Tees', 'Headwear', 'Kicks']
  },

  // -------------------------------------------------------------
  // 3. FOOD & RESTAURANT CATEGORY (1 Free, 2 Pro)
  // -------------------------------------------------------------
  food_menu: {
    id: 'food_menu',
    category_id: 'food',
    name: 'Bistro Digital Menu',
    category: 'Restaurant & Dining',
    is_pro: false,
    tier_badge: 'FREE',
    tagline: 'Menu-first ordering with portion selector & paid extra toppings',
    description: 'Digital restaurant menu with sticky category navigation, portion choices, and paid extra topping checkboxes.',
    badge: 'Menu Starter',
    icon: '🍔',
    accent_color: '#D97706',
    accent_bg: '#FEF3C7',
    hero_headline: 'Freshly Prepared Meals Delivered Hot',
    hero_subheading: 'Choose your portion, add your favorite toppings and sides, and order in seconds.',
    product_label_singular: 'Dish / Meal',
    product_label_plural: 'Menu Items',
    features: [
      'Categorized menu with sticky navigation',
      'Portion selector & extra toppings customizer',
      'Preparation time estimates & chef notes'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'standard_clean',
    supports_variants: true,
    supports_option_groups: true,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Chef Specials', 'Main Dishes', 'Grills & Shawarma', 'Sides', 'Drinks']
  },

  food_gourmet: {
    id: 'food_gourmet',
    category_id: 'food',
    name: 'Gourmet Dining',
    category: 'Restaurant & Dining',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Fine dining culinary showcase with single full cover image without button clutter',
    description: 'Fine dining and gourmet kitchen showcase with high-impact culinary photography cover, required option group rules, and spice level indicators.',
    badge: 'Pro Gourmet',
    icon: '🍲',
    accent_color: '#B45309',
    accent_bg: '#FFFBEB',
    hero_headline: 'Artisanal Flavors & Culinary Excellence',
    hero_subheading: 'Crafted with prime ingredients and cooked to order for the ultimate dining experience.',
    product_label_singular: 'Gourmet Dish',
    product_label_plural: 'Gourmet Selections',
    features: [
      'Single culinary cover image banner',
      'Minimalist image-first header',
      'Required option groups & paid toppings'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_clean',
    default_cover_image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&h=650&q=80',
    supports_variants: true,
    supports_option_groups: true,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Signature Entrees', 'Wood-Fired Grills', 'Artisan Pastas', 'Desserts']
  },

  food_fastcasual: {
    id: 'food_fastcasual',
    category_id: 'food',
    name: 'Quick Kitchen Express',
    category: 'Restaurant & Dining',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'High-speed ordering with dark overlay hero & aesthetic call-to-action',
    description: 'Fast food and cloud kitchen with customizable dark overlay cover banner, white headline typography, combo meal builders, and aesthetic CTA button.',
    badge: 'Pro Express',
    icon: '🍕',
    accent_color: '#EA580C',
    accent_bg: '#FFEDD5',
    hero_headline: 'Fast, Delicious & Ready When You Are',
    hero_subheading: 'Customize your combo pack and choose fast delivery or instant store pickup.',
    product_label_singular: 'Combo / Item',
    product_label_plural: 'Express Menu',
    features: [
      'Cover image with customizable dark overlay',
      'White headline & aesthetic CTA button',
      'Combo meal builder & preparation notes'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_overlay_cta',
    default_cover_image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&h=650&q=80',
    default_overlay_color: '#0F172A',
    cta_button_text: 'Order Hot Meals ↓',
    supports_variants: true,
    supports_option_groups: true,
    supports_specs: false,
    supports_attributes: false,
    sample_categories: ['All', 'Combos & Deals', 'Burgers & Wraps', 'Wings & Bites', 'Beverages']
  },

  // -------------------------------------------------------------
  // 4. BEAUTY & PERSONAL CARE CATEGORY (1 Free, 2 Pro)
  // -------------------------------------------------------------
  beauty_cosmetic: {
    id: 'beauty_cosmetic',
    category_id: 'beauty',
    name: 'Clean Cosmetics',
    category: 'Cosmetics & Skincare',
    is_pro: false,
    tier_badge: 'FREE',
    tagline: 'Cosmetic showcase with shade swatches, bottle sizes & ingredients',
    description: 'For skincare, makeup, and personal care brands with shade selectors, bottle volume sizes, and key ingredients lists.',
    badge: 'Clean Starter',
    icon: '✨',
    accent_color: '#9333EA',
    accent_bg: '#F3E8FF',
    hero_headline: 'Clean Formulations & Glow Essentials',
    hero_subheading: 'Discover gentle, proven skincare and beauty tailored to your skin type.',
    product_label_singular: 'Product',
    product_label_plural: 'Beauty Essentials',
    features: [
      'Visual Shade Selector preview dots',
      'Bottle Volume selector (30ml, 50ml, 100ml)',
      'Formulation badges (Serum, Cream, Oil)'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'standard_clean',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'Skincare', 'Serums & Oils', 'Makeup & Lips', 'Haircare']
  },

  beauty_luxury: {
    id: 'beauty_luxury',
    category_id: 'beauty',
    name: 'Luxury Apothecary',
    category: 'Cosmetics & Skincare',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Luxury skincare showcase with single full cover image without button clutter',
    description: 'Luxury cosmetic showcase with high-impact skincare photography cover, skin concern filter tags, beauty routine guides, and clinical active ingredient breakdown.',
    badge: 'Pro Luxury',
    icon: '💄',
    accent_color: '#7E22CE',
    accent_bg: '#FAF5FF',
    hero_headline: 'Elevated Skincare & Proven Actives',
    hero_subheading: 'Clinical-grade skincare formulated to nourish, protect, and illuminate your skin.',
    product_label_singular: 'Formula',
    product_label_plural: 'Luxury Formulations',
    features: [
      'Single apothecary cover image banner',
      'Minimalist image-first header',
      'Key active ingredients breakdown'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_clean',
    default_cover_image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&h=650&q=80',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'Cleansers & Toners', 'Active Serums', 'Moisturizers', 'Sun Protection']
  },

  beauty_botanical: {
    id: 'beauty_botanical',
    category_id: 'beauty',
    name: 'Organic Botanicals',
    category: 'Cosmetics & Skincare',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Earthy organic aesthetic with dark overlay hero & aesthetic call-to-action',
    description: 'Organic wellness and natural haircare with customizable dark overlay cover banner, white headline typography, botanical badges, and aesthetic CTA button.',
    badge: 'Pro Botanical',
    icon: '🌿',
    accent_color: '#15803D',
    accent_bg: '#F0FDF4',
    hero_headline: '100% Pure Botanical Extracts & Hair Wellness',
    hero_subheading: 'Handcrafted organic oils, butters, and elixirs sourced directly from nature.',
    product_label_singular: 'Botanical Blend',
    product_label_plural: 'Botanical Blends',
    features: [
      'Cover image with customizable dark overlay',
      'White headline & aesthetic CTA button',
      'Organic purity & how-to-use ritual instructions'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_overlay_cta',
    default_cover_image: 'https://images.unsplash.com/photo-1608248597359-00f728c736e6?auto=format&fit=crop&w=1600&h=650&q=80',
    default_overlay_color: '#064E3B',
    cta_button_text: 'Discover Pure Blends ↓',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: false,
    supports_attributes: true,
    sample_categories: ['All', 'Body & Hair Oils', 'Organic Butters', 'Herbal Masks', 'Bath & Body']
  },

  // -------------------------------------------------------------
  // 5. ELECTRONICS & GADGETS CATEGORY (1 Free, 2 Pro)
  // -------------------------------------------------------------
  electronics_tech: {
    id: 'electronics_tech',
    category_id: 'electronics',
    name: 'Tech Specs Catalog',
    category: 'Consumer Electronics',
    is_pro: false,
    tier_badge: 'FREE',
    tagline: 'Tech catalog with storage variants, condition tags & warranty badges',
    description: 'For smartphones, laptops, and electronics with storage/RAM options, condition tiers (New/Refurbished), and warranty periods.',
    badge: 'Tech Starter',
    icon: '⚡',
    accent_color: '#2563EB',
    accent_bg: '#DBEAFE',
    hero_headline: 'Premium Devices & Smart Tech Gear',
    hero_subheading: 'Explore genuine smartphones, laptops, and accessories with verified warranties.',
    product_label_singular: 'Device',
    product_label_plural: 'Devices & Accessories',
    features: [
      'Configuration selector (128GB, 256GB, 512GB)',
      'Condition indicators (Brand New, Refurbished)',
      'Warranty coverage badges'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'standard_clean',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: true,
    supports_attributes: false,
    sample_categories: ['All', 'Smartphones', 'Laptops & PCs', 'Audio & Headphones', 'Accessories']
  },

  electronics_cyber: {
    id: 'electronics_cyber',
    category_id: 'electronics',
    name: 'Cyber Gadget Studio',
    category: 'Consumer Electronics',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Futuristic hardware studio with single full cover image without button clutter',
    description: 'Futuristic high-tech aesthetic with high-impact hardware photography cover, detailed technical specs table (CPU, RAM, Display, Battery), and config pricing.',
    badge: 'Pro Cyber',
    icon: '💻',
    accent_color: '#1D4ED8',
    accent_bg: '#EFF6FF',
    hero_headline: 'Next-Gen Performance & Smart Ecosystems',
    hero_subheading: 'Unleash flagship power with certified authentic hardware and official warranty protection.',
    product_label_singular: 'Hardware Item',
    product_label_plural: 'Flagship Hardware',
    features: [
      'Single high-tech hardware cover image banner',
      'Minimalist image-first header',
      'Structured technical specifications table'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_clean',
    default_cover_image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1600&h=650&q=80',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: true,
    supports_attributes: false,
    sample_categories: ['All', 'Flagship Phones', 'Creator Laptops', 'Gaming Consoles', 'Smart Audio']
  },

  electronics_compare: {
    id: 'electronics_compare',
    category_id: 'electronics',
    name: 'Pro Device Hub',
    category: 'Consumer Electronics',
    is_pro: true,
    tier_badge: 'PRO',
    tagline: 'Device grading hub with dark overlay hero & aesthetic call-to-action',
    description: 'Device grading hub with customizable dark overlay cover banner, white headline typography, serial verification, and aesthetic CTA button.',
    badge: 'Pro Certified',
    icon: '📱',
    accent_color: '#0284C7',
    accent_bg: '#E0F2FE',
    hero_headline: 'Certified Authentic Devices with Verified Warranty',
    hero_subheading: 'Every device undergoes a 40-point quality check and comes with our warranty seal.',
    product_label_singular: 'Certified Device',
    product_label_plural: 'Certified Devices',
    features: [
      'Cover image with customizable dark overlay',
      'White headline & aesthetic CTA button',
      'Device grading badge tiers & warranty seal'
    ],
    preview_image: '/assets/images/templates/.png',
    banner_style: 'cover_overlay_cta',
    default_cover_image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&h=650&q=80',
    default_overlay_color: '#0B0F19',
    cta_button_text: 'Explore Certified Gear ↓',
    supports_variants: true,
    supports_option_groups: false,
    supports_specs: true,
    supports_attributes: false,
    sample_categories: ['All', 'Certified iPhones', 'MacBooks & Laptops', 'Smart Watches', 'Audio Gear']
  }
};

// Automatically set high-resolution preview image paths
Object.keys(STORE_TEMPLATES).forEach(key => {
  (STORE_TEMPLATES[key] as any).preview_image = `/assets/images/templates/${key}.svg`;
});

/**
 * Get Template Config by Identifier with Safe Default Fallback
 */
export function getStoreTemplateConfig(templateSlug?: string | null): StoreTemplateConfig {
  const normalized = String(templateSlug || '').toLowerCase().trim();

  // 1. Direct exact template match (e.g. fashion_runway, food_menu)
  if (STORE_TEMPLATES[normalized]) {
    return STORE_TEMPLATES[normalized];
  }

  // 2. Category aliases / legacy identifier fallbacks -> Return default Free starter template
  if (normalized.includes('food') || normalized.includes('restaurant') || normalized.includes('bistro') || normalized.includes('menu')) {
    return STORE_TEMPLATES.food_menu;
  }
  if (normalized.includes('fashion') || normalized.includes('boutique') || normalized.includes('lookbook') || normalized.includes('apparel')) {
    return STORE_TEMPLATES.fashion_lookbook;
  }
  if (normalized.includes('beauty') || normalized.includes('cosmetic') || normalized.includes('glow') || normalized.includes('skincare')) {
    return STORE_TEMPLATES.beauty_cosmetic;
  }
  if (normalized.includes('electronic') || normalized.includes('tech') || normalized.includes('gadget') || normalized.includes('device')) {
    return STORE_TEMPLATES.electronics_tech;
  }

  return STORE_TEMPLATES.general_clean;
}

/**
 * Get all 3 templates for a given category (1 Free, 2 Pro)
 */
export function getTemplatesByCategory(categoryId: string): StoreTemplateConfig[] {
  const cat = String(categoryId || 'general').toLowerCase().trim();
  const matchedCat = STORE_CATEGORIES[cat] ? cat : 'general';
  return Object.values(STORE_TEMPLATES).filter(t => t.category_id === matchedCat);
}
