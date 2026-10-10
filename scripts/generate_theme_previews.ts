import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'src/public/assets/images/templates');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

interface ThemePreviewData {
  id: string;
  name: string;
  category: string;
  isPro: boolean;
  accentColor: string;
  accentBg: string;
  heroBgGradient: [string, string];
  headline: string;
  subhead: string;
  badgeText: string;
  products: Array<{
    title: string;
    price: string;
    oldPrice?: string;
    tag?: string;
    variantType?: string;
    variants?: string[];
    icon: string;
    iconBg: string;
  }>;
}

const THEMES: ThemePreviewData[] = [
  // 1. GENERAL STORE
  {
    id: 'general_clean',
    name: 'Classic Grid',
    category: 'General Retail',
    isPro: false,
    accentColor: '#087A50',
    accentBg: '#EAF7F0',
    heroBgGradient: ['#EAF7F0', '#FFFFFF'],
    headline: 'Curated Essentials & Everyday Favorites',
    subhead: 'Browse our complete catalog and order directly for fast delivery.',
    badgeText: 'FREE STARTER',
    products: [
      { title: 'Stainless Steel Water Bottle', price: '₦8,500', oldPrice: '₦10,000', tag: '-15%', icon: '🧴', iconBg: '#EAF7F0' },
      { title: 'Ergonomic Desk Organizer', price: '₦12,000', tag: 'Popular', icon: '📦', iconBg: '#F0FDF4' },
      { title: 'Aroma Diffuser & Essential Oil', price: '₦16,500', oldPrice: '₦19,000', tag: 'Sale', icon: '🕯️', iconBg: '#FEF3C7' }
    ]
  },
  {
    id: 'general_modern',
    name: 'Modern Showcase',
    category: 'General Retail',
    isPro: true,
    accentColor: '#059669',
    accentBg: '#ECFDF5',
    heroBgGradient: ['#064E3B', '#022C22'],
    headline: 'Premium Retail & Exclusive Collections',
    subhead: 'Discover top-rated selections with priority express fulfillment.',
    badgeText: 'PRO SHOWCASE 💎',
    products: [
      { title: 'Acoustic Studio Headset Pro', price: '₦48,000', oldPrice: '₦55,000', tag: 'HOT DEAL', icon: '🎧', iconBg: '#ECFDF5' },
      { title: 'Smart LED Ambient Lamp', price: '₦24,500', tag: 'Top Rated', icon: '💡', iconBg: '#F0FDF4' },
      { title: 'Minimalist Leather Desk Pad', price: '₦14,000', oldPrice: '₦18,000', tag: '-22%', icon: '🖥️', iconBg: '#FEF3C7' }
    ]
  },
  {
    id: 'general_minimal',
    name: 'Minimalist Boutique',
    category: 'General Retail',
    isPro: true,
    accentColor: '#18181B',
    accentBg: '#F4F4F5',
    heroBgGradient: ['#18181B', '#09090B'],
    headline: 'Simplicity & Quality in Every Detail',
    subhead: 'Carefully selected goods crafted for everyday modern living.',
    badgeText: 'PRO BOUTIQUE 💎',
    products: [
      { title: 'Monochrome Ceramic Vase', price: '₦22,000', tag: 'Edition 01', icon: '🏺', iconBg: '#27272A' },
      { title: 'Hand-Poured Soy Candle', price: '₦11,500', tag: 'Limited', icon: '🕯️', iconBg: '#27272A' },
      { title: 'Architectural Linen Notebook', price: '₦7,000', tag: 'Restocked', icon: '📓', iconBg: '#27272A' }
    ]
  },

  // 2. FASHION & APPAREL
  {
    id: 'fashion_lookbook',
    name: 'Lookbook Clean',
    category: 'Fashion & Apparel',
    isPro: false,
    accentColor: '#BE185D',
    accentBg: '#FCE7F3',
    heroBgGradient: ['#FDF2F8', '#FFFFFF'],
    headline: 'New Season Collections & Wardrobe Staples',
    subhead: 'Select your preferred size and color combinations with live stock updates.',
    badgeText: 'FREE STARTER',
    products: [
      { title: 'Silk Evening Gown', price: '₦35,000', variants: ['XS', 'S', 'M', 'L'], icon: '👗', iconBg: '#FCE7F3' },
      { title: 'Tailored Italian Linen Blazer', price: '₦42,000', variants: ['38', '40', '42'], icon: '🧥', iconBg: '#FDF2F8' },
      { title: 'Genuine Leather Crossbody Bag', price: '₦28,500', variants: ['Black', 'Tan'], icon: '👜', iconBg: '#FFF1F2' }
    ]
  },
  {
    id: 'fashion_runway',
    name: 'Runway Boutique',
    category: 'Fashion & Apparel',
    isPro: true,
    accentColor: '#9D174D',
    accentBg: '#FCE7F3',
    heroBgGradient: ['#4C0519', '#1C020A'],
    headline: 'Haute Couture & Exclusive Fashion Drops',
    subhead: 'Editorial curation with multi-angle photography and luxury packaging.',
    badgeText: 'PRO RUNWAY 💎',
    products: [
      { title: 'Velvet Met Gala Maxi Dress', price: '₦78,000', oldPrice: '₦95,000', tag: 'VIP EXCLUSIVE', variants: ['S', 'M', 'L'], icon: '✨', iconBg: '#831843' },
      { title: 'Custom Embroidered Kaftan', price: '₦65,000', tag: 'Handmade', variants: ['Custom Fit'], icon: '🥻', iconBg: '#831843' },
      { title: 'Gold Plated Statement Choker', price: '₦32,000', tag: '18k Gold', icon: '📿', iconBg: '#831843' }
    ]
  },
  {
    id: 'fashion_streetwear',
    name: 'Streetwear Drop',
    category: 'Fashion & Apparel',
    isPro: true,
    accentColor: '#10B981',
    accentBg: '#064E3B',
    heroBgGradient: ['#09090B', '#111827'],
    headline: 'Limited Capsule Drops & Urban Apparel',
    subhead: 'Real-time stock urgency indicators with instant WhatsApp checkout.',
    badgeText: 'PRO STREETWEAR 💎',
    products: [
      { title: 'Acid Wash Heavyweight Hoodie', price: '₦38,000', tag: 'ONLY 3 LEFT', variants: ['M', 'L', 'XL', 'XXL'], icon: '🔥', iconBg: '#18181B' },
      { title: 'Cargo Multi-Pocket Pants', price: '₦29,000', tag: 'DROP 04', variants: ['30', '32', '34'], icon: '👖', iconBg: '#18181B' },
      { title: 'Chunky Sole Street Sneakers', price: '₦55,000', tag: 'VERIFIED', variants: ['42', '43', '44'], icon: '👟', iconBg: '#18181B' }
    ]
  },

  // 3. FOOD & RESTAURANT
  {
    id: 'food_menu',
    name: 'Digital Menu',
    category: 'Food & Restaurant',
    isPro: false,
    accentColor: '#D97706',
    accentBg: '#FEF3C7',
    heroBgGradient: ['#FFFBEB', '#FFFFFF'],
    headline: 'Freshly Prepared Meals & Signature Recipes',
    subhead: 'Customize your portion sizes and add mouth-watering sides with custom prep notes.',
    badgeText: 'FREE STARTER',
    products: [
      { title: 'Smoky Jollof & Grilled Chicken', price: '₦4,000', variants: ['Regular', 'Jumbo +₦2.5k'], icon: '🍗', iconBg: '#FEF3C7' },
      { title: 'Pounded Yam & Seafood Okro', price: '₦6,500', variants: ['Goat Meat', 'Seafood'], icon: '🍲', iconBg: '#FEF3C7' },
      { title: 'Crispy Peppered Turkey Platter', price: '₦5,500', tag: 'Spicy 🔥', icon: '🌶️', iconBg: '#FEE2E2' }
    ]
  },
  {
    id: 'food_gourmet',
    name: 'Gourmet Bistro',
    category: 'Food & Restaurant',
    isPro: true,
    accentColor: '#EA580C',
    accentBg: '#FFEDD5',
    heroBgGradient: ['#431407', '#1C0602'],
    headline: 'Fine Dining, Chef Specials & Wine Pairings',
    subhead: 'Artisanal culinary experience with sommelier pairings and table reservations.',
    badgeText: 'PRO GOURMET 💎',
    products: [
      { title: 'Prime Ribeye Steak 400g', price: '₦28,000', tag: 'Chef Choice', variants: ['Medium Rare', 'Well Done'], icon: '🥩', iconBg: '#7C2D12' },
      { title: 'Truffle Butter Tagliatelle', price: '₦18,500', tag: 'Handmade Pasta', icon: '🍝', iconBg: '#7C2D12' },
      { title: 'Molten Lava Chocolate Soufflé', price: '₦8,500', tag: 'Dessert', icon: '🍮', iconBg: '#7C2D12' }
    ]
  },
  {
    id: 'food_fastcasual',
    name: 'Fast Casual Express',
    category: 'Food & Restaurant',
    isPro: true,
    accentColor: '#DC2626',
    accentBg: '#FEE2E2',
    heroBgGradient: ['#7F1D1D', '#3F0A0A'],
    headline: 'Fast Food Combos, Burgers & Rush Delivery',
    subhead: 'Rapid meal builder with real-time rush queue tracking.',
    badgeText: 'PRO FAST CASUAL 💎',
    products: [
      { title: 'Double Smash Monster Burger', price: '₦7,500', tag: '⚡ 15 MINS', variants: ['Single', 'Double', 'Combo Meal'], icon: '🍔', iconBg: '#991B1B' },
      { title: 'Loaded Cheese & Bacon Fries', price: '₦4,200', tag: 'Best Seller', icon: '🍟', iconBg: '#991B1B' },
      { title: 'Oreo Thick Milkshake (Large)', price: '₦3,500', tag: 'Chilled', icon: '🥤', iconBg: '#991B1B' }
    ]
  },

  // 4. BEAUTY & PERSONAL CARE
  {
    id: 'beauty_cosmetic',
    name: 'Cosmetic Glow',
    category: 'Beauty & Personal Care',
    isPro: false,
    accentColor: '#9333EA',
    accentBg: '#F3E8FF',
    heroBgGradient: ['#FAF5FF', '#FFFFFF'],
    headline: 'Flawless Beauty & Dermatologist Formulated Skincare',
    subhead: 'Select your shade swatch, bottle volume, and formulation type.',
    badgeText: 'FREE STARTER',
    products: [
      { title: 'Glow Boost Niacinamide Serum', price: '₦8,500', variants: ['30ml', '50ml (₦13.5k)'], icon: '✨', iconBg: '#F3E8FF' },
      { title: 'Velvet Matte Liquid Lipstick', price: '₦6,000', variants: ['Ruby', 'Nude', 'Plum'], icon: '💄', iconBg: '#FCE7F3' },
      { title: 'Hydrating Ceramide Barrier Cream', price: '₦11,000', tag: 'SPF 50+', icon: '🧴', iconBg: '#F3E8FF' }
    ]
  },
  {
    id: 'beauty_luxury',
    name: 'Luxury Atelier',
    category: 'Beauty & Personal Care',
    isPro: true,
    accentColor: '#7E22CE',
    accentBg: '#F3E8FF',
    heroBgGradient: ['#3B0764', '#17022B'],
    headline: 'High Perfumery, Anti-Aging & VIP Beauty',
    subhead: 'Scent pyramids, clinical trial verification, and bespoke consultations.',
    badgeText: 'PRO ATELIER 💎',
    products: [
      { title: 'Oud Royal Extrait de Parfum 100ml', price: '₦95,000', tag: 'French Atelier', variants: ['50ml', '100ml'], icon: '👑', iconBg: '#581C87' },
      { title: '24K Gold Cellular Rejuvenation Mask', price: '₦42,000', tag: 'Clinical Proven', icon: '🌟', iconBg: '#581C87' },
      { title: 'Silk Protein Restorative Hair Oil', price: '₦24,000', tag: 'Pure Argan', icon: '💧', iconBg: '#581C87' }
    ]
  },
  {
    id: 'beauty_botanical',
    name: 'Botanical Clean',
    category: 'Beauty & Personal Care',
    isPro: true,
    accentColor: '#059669',
    accentBg: '#ECFDF5',
    heroBgGradient: ['#064E3B', '#022C22'],
    headline: '100% Organic, Vegan & Cruelty-Free Wellness',
    subhead: 'Pure cold-pressed botanicals with zero synthetic fragrances or parabens.',
    badgeText: 'PRO BOTANICAL 💎',
    products: [
      { title: 'Cold-Pressed Rosehip Seed Elixir', price: '₦16,000', tag: 'ECOCERT VEGAN', variants: ['30ml', '60ml'], icon: '🌿', iconBg: '#065F46' },
      { title: 'Bamboo Charcoal Purifying Scrub', price: '₦9,500', tag: 'Zero Waste', icon: '🌱', iconBg: '#065F46' },
      { title: 'Whipped Shea Butter with Lavender', price: '₦7,500', tag: 'Raw Organic', icon: '🍃', iconBg: '#065F46' }
    ]
  },

  // 5. ELECTRONICS & GADGETS
  {
    id: 'electronics_tech',
    name: 'Tech Grid',
    category: 'Electronics & Gadgets',
    isPro: false,
    accentColor: '#2563EB',
    accentBg: '#DBEAFE',
    heroBgGradient: ['#EFF6FF', '#FFFFFF'],
    headline: 'Flagship Smartphones, Laptops & Smart Audio',
    subhead: 'Compare storage tiers, processor models, and verified warranty periods.',
    badgeText: 'FREE STARTER',
    products: [
      { title: 'Pro Ultra Smartphone 5G', price: '₦450,000', variants: ['256GB', '512GB (₦520k)'], icon: '📱', iconBg: '#DBEAFE' },
      { title: 'Active Noise Cancelling Wireless Buds', price: '₦38,000', oldPrice: '₦45,000', tag: 'ANC 40dB', icon: '🎧', iconBg: '#EFF6FF' },
      { title: '65W GaN Fast Dual USB-C Charger', price: '₦14,500', tag: 'Fast Charge', icon: '⚡', iconBg: '#FEF3C7' }
    ]
  },
  {
    id: 'electronics_cyber',
    name: 'Cyber Tech Hub',
    category: 'Electronics & Gadgets',
    isPro: true,
    accentColor: '#3B82F6',
    accentBg: '#1E3A8A',
    heroBgGradient: ['#0F172A', '#020617'],
    headline: 'Pro Gaming Gear, RTX Laptops & Cyber Peripherals',
    subhead: 'Real-time FPS benchmark scores and mechanical switch selection.',
    badgeText: 'PRO CYBER 💎',
    products: [
      { title: 'RTX 4080 OLED Gaming Laptop 16"', price: '₦1,850,000', tag: '240Hz OLED', variants: ['16GB', '32GB RAM'], icon: '💻', iconBg: '#1E293B' },
      { title: 'Custom Hot-Swap Mechanical Keyboard', price: '₦68,000', tag: 'RGB Wireless', variants: ['Linear Red', 'Tactile Brown'], icon: '⌨️', iconBg: '#1E293B' },
      { title: '4K Ultra HD Gaming Stream Webcam', price: '₦45,000', tag: '60 FPS', icon: '📷', iconBg: '#1E293B' }
    ]
  },
  {
    id: 'electronics_compare',
    name: 'Pro Device Hub',
    category: 'Electronics & Gadgets',
    isPro: true,
    accentColor: '#0284C7',
    accentBg: '#E0F2FE',
    heroBgGradient: ['#082F49', '#03141F'],
    headline: 'Certified Authentic Devices with Verified Warranty',
    subhead: 'Every device undergoes a 40-point quality check with our official seal.',
    badgeText: 'PRO CERTIFIED 💎',
    products: [
      { title: 'iPhone 15 Pro Max 256GB', price: '₦1,150,000', tag: '40-PT TESTED', variants: ['Grade A+', 'Factory Sealed'], icon: '📱', iconBg: '#0C4A6E' },
      { title: 'M3 Pro MacBook 14" Space Black', price: '₦1,920,000', tag: '100% BATTERY', variants: ['512GB', '1TB'], icon: '💻', iconBg: '#0C4A6E' },
      { title: 'Smart Watch Ultra Cellular 49mm', price: '₦280,000', tag: '1 YR WARRANTY', icon: '⌚', iconBg: '#0C4A6E' }
    ]
  }
];

function generateSvg(tpl: ThemePreviewData): string {
  const isDarkHero = tpl.heroBgGradient[0].startsWith('#0') || tpl.heroBgGradient[0].startsWith('#1') || tpl.heroBgGradient[0].startsWith('#3') || tpl.heroBgGradient[0].startsWith('#4') || tpl.heroBgGradient[0].startsWith('#7');
  const heroTextColor = isDarkHero ? '#FFFFFF' : '#08110D';
  const heroSubtextColor = isDarkHero ? 'rgba(255,255,255,0.75)' : '#6B756F';
  const navBg = isDarkHero ? '#08110D' : '#FFFFFF';
  const navTextColor = isDarkHero ? '#FFFFFF' : '#08110D';
  const navBorderColor = isDarkHero ? 'rgba(255,255,255,0.1)' : '#E3E9E5';
  const cardBg = isDarkHero ? '#121915' : '#FFFFFF';
  const cardBorder = isDarkHero ? 'rgba(255,255,255,0.1)' : '#E3E9E5';
  const cardTextColor = isDarkHero ? '#FFFFFF' : '#08110D';
  const cardMutedColor = isDarkHero ? '#9CA3AF' : '#6B756F';

  return `
<svg width="800" height="500" viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="heroGrad_${tpl.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${tpl.heroBgGradient[0]}"/>
      <stop offset="100%" stop-color="${tpl.heroBgGradient[1]}"/>
    </linearGradient>
    <filter id="shadow_${tpl.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- Background Base Canvas -->
  <rect width="800" height="500" rx="16" fill="${isDarkHero ? '#08110D' : '#F8FAF8'}"/>

  <!-- Browser Frame Header -->
  <rect width="800" height="36" rx="16" fill="${isDarkHero ? '#0F1713' : '#F1F5F2'}"/>
  <rect y="20" width="800" height="16" fill="${isDarkHero ? '#0F1713' : '#F1F5F2'}"/>
  <circle cx="24" cy="18" r="5" fill="#EF4444"/>
  <circle cx="40" cy="18" r="5" fill="#F59E0B"/>
  <circle cx="56" cy="18" r="5" fill="#10B981"/>

  <!-- URL Address Bar -->
  <rect x="180" y="7" width="440" height="22" rx="6" fill="${isDarkHero ? 'rgba(255,255,255,0.08)' : '#FFFFFF'}" stroke="${isDarkHero ? 'rgba(255,255,255,0.1)' : '#E3E9E5'}"/>
  <text x="400" y="22" font-size="11" fill="${isDarkHero ? 'rgba(255,255,255,0.6)' : '#6B756F'}" text-anchor="middle" font-family="'JetBrains Mono', monospace">🔒 zlik.store/official-store</text>

  <!-- Store Navigation Header -->
  <g transform="translate(0, 36)">
    <rect width="800" height="52" fill="${navBg}" stroke="${navBorderColor}" stroke-width="1"/>
    
    <!-- Store Brand / Logo -->
    <rect x="24" y="10" width="32" height="32" rx="8" fill="${tpl.accentColor}"/>
    <text x="40" y="31" font-size="15" fill="#FFFFFF" text-anchor="middle" font-weight="bold">Z</text>
    <text x="66" y="27" font-size="13" font-weight="bold" fill="${navTextColor}">LUXE AURA</text>
    <text x="66" y="38" font-size="9.5" fill="#10B981" font-weight="bold">● VERIFIED STORE</text>

    <!-- Search Mockup -->
    <rect x="240" y="12" width="300" height="28" rx="8" fill="${isDarkHero ? 'rgba(255,255,255,0.08)' : '#F8FAF8'}" stroke="${navBorderColor}"/>
    <text x="255" y="30" font-size="11" fill="${isDarkHero ? 'rgba(255,255,255,0.5)' : '#9CA3AF'}">🔍 Search products, categories...</text>

    <!-- Cart / Chat Buttons -->
    <rect x="690" y="11" width="86" height="30" rx="8" fill="${isDarkHero ? '#19D98B' : '#08110D'}"/>
    <text x="733" y="30" font-size="11" font-weight="bold" fill="${isDarkHero ? '#08110D' : '#FFFFFF'}" text-anchor="middle">🛒 Cart (2)</text>
  </g>

  <!-- Hero Spotlight Section -->
  <g transform="translate(0, 88)">
    <rect width="800" height="135" fill="url(#heroGrad_${tpl.id})"/>
    
    <!-- Category & Plan Badge -->
    <rect x="24" y="16" width="${tpl.isPro ? 130 : 110}" height="22" rx="11" fill="${isDarkHero ? 'rgba(255,255,255,0.15)' : tpl.accentBg}" stroke="${tpl.accentColor}" stroke-width="1"/>
    <text x="34" y="31" font-size="10" font-weight="bold" fill="${isDarkHero ? '#19D98B' : tpl.accentColor}">${tpl.badgeText}</text>

    <!-- Hero Headline -->
    <text x="24" y="62" font-size="20" font-weight="800" fill="${heroTextColor}">${tpl.headline}</text>
    <text x="24" y="82" font-size="12" fill="${heroSubtextColor}">${tpl.subhead}</text>

    <!-- Delivery / Service Badges -->
    <rect x="24" y="98" width="130" height="22" rx="6" fill="${isDarkHero ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}"/>
    <text x="32" y="113" font-size="10" font-weight="bold" fill="${heroTextColor}">⚡ 24h Express Dispatch</text>

    <rect x="162" y="98" width="125" height="22" rx="6" fill="${isDarkHero ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}"/>
    <text x="170" y="113" font-size="10" font-weight="bold" fill="${heroTextColor}">💬 WhatsApp Live Chat</text>
  </g>

  <!-- 3 Product Cards Showcase Grid -->
  <g transform="translate(0, 235)">
    ${tpl.products.map((p, idx) => {
      const x = 24 + idx * 256;
      return `
        <g transform="translate(${x}, 0)" filter="url(#shadow_${tpl.id})">
          <rect width="240" height="245" rx="14" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1"/>
          
          <!-- Image Box Mockup with Center Visual Icon -->
          <rect x="10" y="10" width="220" height="115" rx="10" fill="${p.iconBg}"/>
          <text x="120" y="78" font-size="42" text-anchor="middle">${p.icon}</text>
          
          ${p.tag ? `
            <rect x="18" y="18" width="${p.tag.length * 7 + 16}" height="18" rx="5" fill="${p.tag.includes('LEFT') || p.tag.includes('-') ? '#EF4444' : '#08110D'}"/>
            <text x="26" y="31" font-size="9" font-weight="bold" fill="#FFFFFF">${p.tag}</text>
          ` : ''}

          <!-- Product Title -->
          <text x="14" y="145" font-size="12" font-weight="bold" fill="${cardTextColor}">${p.title}</text>
          
          <!-- Price & Old Price -->
          <text x="14" y="168" font-size="14" font-weight="800" fill="${tpl.accentColor}">${p.price}</text>
          ${p.oldPrice ? `<text x="90" y="168" font-size="11" fill="${cardMutedColor}" text-decoration="line-through">${p.oldPrice}</text>` : ''}

          <!-- Variant Chips / Attribute preview -->
          ${p.variants && p.variants.length > 0 ? `
            <g transform="translate(14, 180)">
              ${p.variants.slice(0, 3).map((v, vIdx) => `
                <rect x="${vIdx * 62}" y="0" width="56" height="18" rx="4" fill="${isDarkHero ? 'rgba(255,255,255,0.08)' : '#F1F5F2'}" stroke="${cardBorder}"/>
                <text x="${vIdx * 62 + 28}" y="12" font-size="9" font-weight="bold" fill="${cardTextColor}" text-anchor="middle">${v}</text>
              `).join('')}
            </g>
          ` : `
            <g transform="translate(14, 182)">
              <text x="0" y="10" font-size="10" fill="${cardMutedColor}">✓ In Stock • Instant Add to WhatsApp Cart</text>
            </g>
          `}

          <!-- Order Button -->
          <rect x="14" y="206" width="212" height="28" rx="8" fill="${isDarkHero ? '#19D98B' : '#08110D'}"/>
          <text x="120" y="224" font-size="11" font-weight="bold" fill="${isDarkHero ? '#08110D' : '#FFFFFF'}" text-anchor="middle">Add to Cart 🛒</text>
        </g>
      `;
    }).join('')}
  </g>

  <!-- Aesthetic Watermark Ribbon for Pro Themes -->
  ${tpl.isPro ? `
    <g transform="translate(680, 440)">
      <rect width="96" height="24" rx="12" fill="#08110D" stroke="#19D98B" stroke-width="1.5"/>
      <text x="48" y="16" font-size="10" font-weight="bold" fill="#19D98B" text-anchor="middle">💎 PRO THEME</text>
    </g>
  ` : ''}
</svg>
  `.trim();
}

for (const theme of THEMES) {
  const filePath = path.join(outDir, `${theme.id}.svg`);
  const svgContent = generateSvg(theme);
  fs.writeFileSync(filePath, svgContent, 'utf8');
  console.log(`✅ Generated preview cover: ${theme.id}.svg`);
}

console.log('\n🎉 Successfully generated all 15 industry theme front view covers!');
