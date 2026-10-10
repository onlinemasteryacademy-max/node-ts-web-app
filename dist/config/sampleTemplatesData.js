/**
 * Zlik Industry Store Templates Sample Data Engine
 * High-Aesthetic Realistic Demo Stores & Products (Exactly 1 Showcase Product Per Template)
 */
export const SAMPLE_STORES_DATA = {
    // -------------------------------------------------------------
    // 1. GENERAL STORE CATEGORY (1 Free, 2 Pro)
    // -------------------------------------------------------------
    general_clean: {
        store: {
            id: 9001,
            slug: 'demo-general-clean',
            store_name: 'Aura Home & Essentials',
            bio: 'Curated home accessories, everyday essentials & lifestyle goods.',
            logo_url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'general_clean',
            primary_color: '#087A50',
            bank_name: 'Zenith Bank',
            bank_account_number: '1012398471',
            bank_account_name: 'Aura Home Living Ltd',
            delivery_fee: 1500
        },
        items: [
            {
                id: 9101,
                title: 'Minimalist Ceramic Vase Set (Nordic Trio)',
                category: 'Home & Living',
                description: 'Set of 3 matte-textured ceramic vases designed for dried florals and minimalist interior styling. Hand-finished porcelain with water-resistant glaze.',
                price: 24500,
                compare_price: 32000,
                stock_quantity: 18,
                sku: 'AURA-VASE-01',
                badge: 'Best Seller',
                image_url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=800&q=80'
                ]),
                is_available: 1
            }
        ]
    },
    general_modern: {
        store: {
            id: 9002,
            slug: 'demo-general-modern',
            store_name: 'Apex Modern Lifestyle',
            bio: 'Premium retail, smart home comforts & curated everyday tech.',
            logo_url: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'general_modern',
            primary_color: '#059669',
            bank_name: 'GTBank',
            bank_account_number: '0239485721',
            bank_account_name: 'Apex Lifestyle Ventures',
            delivery_fee: 2000
        },
        items: [
            {
                id: 9105,
                title: 'AromaPulse Ultrasonic Diffuser & Ambient Lamp',
                category: 'Smart Living',
                description: 'Quiet ultrasonic essential oil diffuser featuring 7 warm ambient LED color modes, auto-shutoff timer, and wood-grain finish.',
                price: 28000,
                compare_price: 36000,
                stock_quantity: 30,
                sku: 'APEX-DIF-01',
                badge: '⚡ Flash Deal',
                image_url: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80'
                ]),
                is_available: 1
            }
        ]
    },
    general_minimal: {
        store: {
            id: 9003,
            slug: 'demo-general-minimal',
            store_name: 'Ochre Studio & Goods',
            bio: 'Monochrome luxury design objects crafted for modern architectural spaces.',
            logo_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&h=650&q=80',
            cover_overlay_color: '#08110D',
            template_slug: 'general_minimal',
            primary_color: '#18181B',
            bank_name: 'Access Bank',
            bank_account_number: '0812938475',
            bank_account_name: 'Ochre Design Studio',
            delivery_fee: 1800
        },
        items: [
            {
                id: 9108,
                title: 'Brutalist Cast Concrete Planter Pot',
                category: 'Architecture & Decor',
                description: 'Raw textured concrete planter with integrated drainage hole and matching minimal saucer. Perfect for succulents and bonsai.',
                price: 22000,
                compare_price: 28000,
                stock_quantity: 12,
                sku: 'OCH-PLT-01',
                badge: 'Edition 01',
                image_url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=800&q=80'
                ]),
                is_available: 1
            }
        ]
    },
    // -------------------------------------------------------------
    // 2. FASHION & APPAREL CATEGORY (1 Free, 2 Pro)
    // -------------------------------------------------------------
    fashion_lookbook: {
        store: {
            id: 9004,
            slug: 'demo-fashion-lookbook',
            store_name: 'Atelier Noir Studio',
            bio: 'Effortless silhouettes, relaxed tailoring & premium seasonal textiles.',
            logo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'fashion_lookbook',
            primary_color: '#BE185D',
            bank_name: 'GTBank',
            bank_account_number: '0129384756',
            bank_account_name: 'Atelier Noir Fashion',
            delivery_fee: 2000
        },
        items: [
            {
                id: 9201,
                title: 'Oversized Silk Linen Camp Collar Shirt',
                category: 'Tops & Shirts',
                description: 'Breezy camp-collar button down cut from a textured mulberry silk and French linen blend. Features mother-of-pearl buttons and relaxed boxy drape.',
                price: 32000,
                compare_price: 42000,
                stock_quantity: 20,
                sku: 'ATN-SHIRT-01',
                badge: 'New Season',
                image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1620012253295-c15c429fccf8?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v1', size: 'S', color: 'Ivory White', price: 32000, image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80' },
                    { id: 'v2', size: 'M', color: 'Midnight Black', price: 32000, image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80' },
                    { id: 'v3', size: 'L', color: 'Sage Olive', price: 34000, image_url: 'https://images.unsplash.com/photo-1620012253295-c15c429fccf8?auto=format&fit=crop&w=800&q=80' }
                ]),
                attributes_json: JSON.stringify({
                    sizes: 'S, M, L, XL',
                    colors: 'Ivory White, Midnight Black, Sage Olive',
                    material: '70% Mulberry Silk, 30% Flax Linen',
                    care: 'Dry clean recommended or cold hand wash'
                }),
                is_available: 1
            }
        ]
    },
    fashion_runway: {
        store: {
            id: 9005,
            slug: 'demo-fashion-runway',
            store_name: 'Maison de L’Étoile Couture',
            bio: 'High-fashion runway eveningwear, sculptural tailoring & couture pieces.',
            logo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'fashion_runway',
            primary_color: '#9D174D',
            bank_name: 'Zenith Bank',
            bank_account_number: '1092837465',
            bank_account_name: 'Maison Etoile Luxury',
            delivery_fee: 3000
        },
        items: [
            {
                id: 9203,
                title: 'Hand-Pleated Emerald Velvet Gown with Train',
                category: 'Couture Dresses',
                description: 'Floor-length corseted evening gown made from heavy silk velvet with sculptural asymmetric shoulder drape and subtle mermaid train.',
                price: 185000,
                compare_price: 240000,
                stock_quantity: 6,
                sku: 'ETOILE-GWN-01',
                badge: 'Couture Exclusive',
                image_url: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v10', size: 'UK 8 / S', color: 'Emerald Green', price: 185000, image_url: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80' },
                    { id: 'v11', size: 'UK 10 / M', color: 'Royal Burgundy', price: 195000, image_url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=800&q=80' }
                ]),
                attributes_json: JSON.stringify({
                    sizes: 'UK 6, UK 8, UK 10, UK 12',
                    colors: 'Emerald Green, Royal Burgundy, Midnight Noir',
                    material: '100% Silk Velvet, Silk Habotai Lining',
                    care: 'Specialist Dry Clean Only'
                }),
                is_available: 1
            }
        ]
    },
    fashion_streetwear: {
        store: {
            id: 9006,
            slug: 'demo-fashion-streetwear',
            store_name: 'HYPEX Underground NYC/LOS',
            bio: 'Limited drop heavy fleece, oversized graphic silhouettes & street culture.',
            logo_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1600&h=650&q=80',
            cover_overlay_color: '#08110D',
            template_slug: 'fashion_streetwear',
            primary_color: '#E11D48',
            bank_name: 'Kuda Bank',
            bank_account_number: '2001928374',
            bank_account_name: 'Hypex Apparel Enterprise',
            delivery_fee: 2000
        },
        items: [
            {
                id: 9205,
                title: '500GSM Heavyweight Boxy Cyber Hoodie',
                category: 'Hoodies & Fleece',
                description: 'Ultra-heavy 500 GSM loopback cotton fleece hoodie with double-layered hood, drop shoulders, and screen-printed cyber graphics on back.',
                price: 45000,
                compare_price: 55000,
                stock_quantity: 12,
                sku: 'HPX-HD-01',
                badge: '🔥 100 Pieces Only',
                image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v20', size: 'M (Boxy Oversized)', color: 'Washed Charcoal', price: 45000 },
                    { id: 'v21', size: 'L (Boxy Oversized)', color: 'Washed Charcoal', price: 45000 },
                    { id: 'v22', size: 'XL (Boxy Oversized)', color: 'Acid Lime', price: 48000 }
                ]),
                attributes_json: JSON.stringify({
                    sizes: 'M, L, XL, XXL',
                    colors: 'Washed Charcoal, Acid Lime, Off-Black',
                    material: '100% Combed French Terry Cotton (500 GSM)',
                    care: 'Wash cold inside out. Hang dry only.'
                }),
                is_available: 1
            }
        ]
    },
    // -------------------------------------------------------------
    // 3. FOOD & RESTAURANT CATEGORY (1 Free, 2 Pro)
    // -------------------------------------------------------------
    food_menu: {
        store: {
            id: 9007,
            slug: 'demo-food-menu',
            store_name: 'Bistro Riviera & Grills',
            bio: 'Flame-grilled steaks, smoky firewood jollof rice & gourmet burgers.',
            logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'food_menu',
            primary_color: '#D97706',
            bank_name: 'Zenith Bank',
            bank_account_number: '1092384751',
            bank_account_name: 'Riviera Grills Restaurant',
            delivery_fee: 1500
        },
        items: [
            {
                id: 9301,
                title: 'Smoky Firewood Party Jollof & Jumbo BBQ Chicken',
                category: 'Main Platters',
                description: 'Authentic Nigerian firewood party jollof served with a seasoned jumbo quarter chicken, spiced fried plantains (dodo), and fresh house coleslaw.',
                price: 5500,
                compare_price: 6500,
                stock_quantity: 50,
                sku: 'RIV-JOL-01',
                badge: 'Chef Recommendation',
                image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80'
                ]),
                option_groups_json: JSON.stringify([
                    {
                        name: 'Choose Portion Size',
                        required: true,
                        options: [
                            { name: 'Single Solo Pack (1 Chicken)', price: 0 },
                            { name: 'Double Platter (2 Chickens + Beef)', price: 4000 },
                            { name: 'Family Platter (Serves 4)', price: 9500 }
                        ]
                    },
                    {
                        name: 'Add Delicious Extras',
                        required: false,
                        options: [
                            { name: 'Extra Sweet Fried Plantain (Dodo)', price: 1000 },
                            { name: 'Peppered Gizzard Skewer', price: 1800 },
                            { name: 'Fried Whole Croaker Fish', price: 4500 }
                        ]
                    }
                ]),
                attributes_json: JSON.stringify({ prep_time: '20-25 mins' }),
                is_available: 1
            }
        ]
    },
    food_gourmet: {
        store: {
            id: 9008,
            slug: 'demo-food-gourmet',
            store_name: 'L’Orangerie Fine Dining & Wine Bar',
            bio: 'Modern French-African fine dining, prime dry-aged cuts & tasting menus.',
            logo_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'food_gourmet',
            primary_color: '#B45309',
            bank_name: 'Stanbic IBTC',
            bank_account_number: '0029384751',
            bank_account_name: 'L’Orangerie Gourmet Ltd',
            delivery_fee: 2500
        },
        items: [
            {
                id: 9303,
                title: '28-Day Dry-Aged Tomahawk Ribeye (800g)',
                category: 'Signature Entrees',
                description: 'Prime bone-in ribeye steak seared over oak wood embers, served with roasted bone marrow butter, truffled potato purée, and red wine jus.',
                price: 48000,
                compare_price: 58000,
                stock_quantity: 10,
                sku: 'LOR-STEAK-01',
                badge: 'Signature',
                image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
                ]),
                option_groups_json: JSON.stringify([
                    {
                        name: 'Doneness *',
                        required: true,
                        options: [
                            { name: 'Medium Rare (Recommended)', price: 0 },
                            { name: 'Medium', price: 0 },
                            { name: 'Medium Well', price: 0 }
                        ]
                    },
                    {
                        name: 'Pairing Sauce',
                        required: false,
                        options: [
                            { name: 'Green Peppercorn Cognac Sauce', price: 2000 },
                            { name: 'Chimichurri Herb Butter', price: 1500 }
                        ]
                    }
                ]),
                attributes_json: JSON.stringify({ prep_time: '35-40 mins', tags: 'Chef Special, Gluten-Free' }),
                is_available: 1
            }
        ]
    },
    food_fastcasual: {
        store: {
            id: 9009,
            slug: 'demo-food-fastcasual',
            store_name: 'Craver’s Smash Shack & Wings',
            bio: 'Crazy loaded smash burgers, Nashville hot chicken wings & thick shakes.',
            logo_url: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&h=650&q=80',
            cover_overlay_color: '#0F172A',
            template_slug: 'food_fastcasual',
            primary_color: '#EA580C',
            bank_name: 'Access Bank',
            bank_account_number: '1283746590',
            bank_account_name: 'Cravers Fast Casual Ltd',
            delivery_fee: 1200
        },
        items: [
            {
                id: 9305,
                title: 'The Monster Oklahoma Onion Smash Combo',
                category: 'Combos & Meals',
                description: 'Crispy lacy-edge smashed beef patties with shaved sweet onions, melted American cheese, secret shack sauce, crinkle fries, and large drink.',
                price: 6500,
                compare_price: 8000,
                stock_quantity: 60,
                sku: 'CRV-SMASH-01',
                badge: '🔥 Fan Favorite',
                image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=800&q=80'
                ]),
                option_groups_json: JSON.stringify([
                    {
                        name: 'Drink Choice',
                        required: true,
                        options: [
                            { name: 'Chilled Coke (330ml)', price: 0 },
                            { name: 'Oreo Thick Shake', price: 1500 }
                        ]
                    },
                    {
                        name: 'Fry Upgrades',
                        required: false,
                        options: [
                            { name: 'Upgrade to Loaded Cheese & Bacon Fries', price: 1200 }
                        ]
                    }
                ]),
                attributes_json: JSON.stringify({ prep_time: '10-15 mins' }),
                is_available: 1
            }
        ]
    },
    // -------------------------------------------------------------
    // 4. BEAUTY & PERSONAL CARE CATEGORY (1 Free, 2 Pro)
    // -------------------------------------------------------------
    beauty_cosmetic: {
        store: {
            id: 9010,
            slug: 'demo-beauty-cosmetic',
            store_name: 'Luxe Glow Cosmetics & Skin',
            bio: 'Clean cosmetics, dewy skin tints & high-performance hydration.',
            logo_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'beauty_cosmetic',
            primary_color: '#9333EA',
            bank_name: 'GTBank',
            bank_account_number: '0192837465',
            bank_account_name: 'Luxe Glow Skincare Ltd',
            delivery_fee: 1500
        },
        items: [
            {
                id: 9401,
                title: 'Hydra-Dew Hyaluronic Acid & Niacinamide Serum',
                category: 'Serums & Oils',
                description: 'Multi-molecular weight hyaluronic acid serum combined with 5% pure niacinamide to plump, brighten, and lock in 72-hour moisture.',
                price: 16500,
                compare_price: 22000,
                stock_quantity: 35,
                sku: 'GLOW-HYD-01',
                badge: 'Cult Classic',
                image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1608248597359-2ff9e3b8a342?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v30', volume: '30ml Dropper', price: 16500 },
                    { id: 'v31', volume: '50ml Deluxe', price: 24500 },
                    { id: 'v32', volume: '100ml Value', price: 38000 }
                ]),
                attributes_json: JSON.stringify({
                    volumes: '30ml Dropper, 50ml Deluxe, 100ml Value',
                    formulation: 'Lightweight Gel-Serum',
                    ingredients: 'Hyaluronic Acid Complex 2%, Niacinamide 5%, Centella Asiatica, Panthenol B5'
                }),
                is_available: 1
            }
        ]
    },
    beauty_luxury: {
        store: {
            id: 9011,
            slug: 'demo-beauty-luxury',
            store_name: 'Maison Éclat Clinical Apothecary',
            bio: 'Bio-cellular restorative concentrates, peptides & clinical youth elixirs.',
            logo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'beauty_luxury',
            primary_color: '#7E22CE',
            bank_name: 'Zenith Bank',
            bank_account_number: '1092847561',
            bank_account_name: 'Maison Eclat Clinical',
            delivery_fee: 2500
        },
        items: [
            {
                id: 9403,
                title: 'Bio-Peptide Cellular Matrix Lifting Concentrate',
                category: 'Cellular Treatments',
                description: 'Advanced clinical peptide concentrate formulated with 8 active biomimetic peptides and marine collagen to visibly firm contours and soften fine lines.',
                price: 42000,
                compare_price: 55000,
                stock_quantity: 15,
                sku: 'ECL-PEP-01',
                badge: 'Clinical Grade',
                image_url: 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v40', volume: '30ml Glass Flacon', price: 42000 },
                    { id: 'v41', volume: '50ml Salon Reserve', price: 62000 }
                ]),
                attributes_json: JSON.stringify({
                    volumes: '30ml Glass Flacon, 50ml Salon Reserve',
                    ingredients: 'Matrixyl 3000 (10%), Argireline (5%), Marine Soluble Collagen, Copper Tripeptide-1'
                }),
                is_available: 1
            }
        ]
    },
    beauty_botanical: {
        store: {
            id: 9012,
            slug: 'demo-beauty-botanical',
            store_name: 'Verdant Botanics & Hair Wellness',
            bio: '100% cold-pressed organic botanical oils, raw butters & herbal infusions.',
            logo_url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1608248597359-00f728c736e6?auto=format&fit=crop&w=1600&h=650&q=80',
            cover_overlay_color: '#064E3B',
            template_slug: 'beauty_botanical',
            primary_color: '#15803D',
            bank_name: 'Kuda Bank',
            bank_account_number: '2009384751',
            bank_account_name: 'Verdant Herbal Botanics',
            delivery_fee: 1500
        },
        items: [
            {
                id: 9404,
                title: 'Raw Chebe & Batana Scalp Growth Elixir (100ml)',
                category: 'Hair Wellness',
                description: 'Authentic Chadian Chebe powder infused in cold-pressed Honduran Batana and rosemary essential oil to stimulate roots and restore density.',
                price: 15000,
                compare_price: 20000,
                stock_quantity: 40,
                sku: 'VRD-CHB-01',
                badge: '100% Organic',
                image_url: 'https://images.unsplash.com/photo-1608248597359-2ff9e3b8a342?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1608248597359-2ff9e3b8a342?auto=format&fit=crop&w=800&q=80'
                ]),
                attributes_json: JSON.stringify({
                    volumes: '100ml Dropper, 250ml Refill Jar',
                    ingredients: 'Raw Batana Oil, Authentic Chebe Extract, Rosemary Essential Oil, Castor Oil'
                }),
                is_available: 1
            }
        ]
    },
    // -------------------------------------------------------------
    // 5. ELECTRONICS & GADGETS CATEGORY (1 Free, 2 Pro)
    // -------------------------------------------------------------
    electronics_tech: {
        store: {
            id: 9013,
            slug: 'demo-electronics-tech',
            store_name: 'TechPulse Prime Gadgets',
            bio: 'Verified smartphones, ultrabooks, audio gear & factory warranties.',
            logo_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'electronics_tech',
            primary_color: '#2563EB',
            bank_name: 'Zenith Bank',
            bank_account_number: '1029384756',
            bank_account_name: 'TechPulse Prime Ltd',
            delivery_fee: 2500
        },
        items: [
            {
                id: 9501,
                title: 'UltraPro 5G Flagship Smartphone (6.8" 120Hz AMOLED)',
                category: 'Smartphones',
                description: 'Equipped with Snapdragon 8 Gen 3, 200MP OIS Quad Camera system, and 5000mAh battery with 100W HyperCharge.',
                price: 680000,
                compare_price: 750000,
                stock_quantity: 15,
                sku: 'TECH-PHN-01',
                badge: 'Official Warranty',
                image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=800&q=80',
                    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v50', config: '256GB / 12GB RAM', price: 680000 },
                    { id: 'v51', config: '512GB / 16GB RAM', price: 760000 },
                    { id: 'v52', config: '1TB / 16GB RAM Special Edition', price: 890000 }
                ]),
                attributes_json: JSON.stringify({
                    configs: '256GB / 12GB RAM, 512GB / 16GB RAM, 1TB / 16GB RAM Special Edition',
                    condition: 'Brand New (Factory Sealed)',
                    warranty: '24 Months Official Manufacturer Warranty',
                    specs_text: 'Snapdragon 8 Gen 3 | 200MP Main + 50MP Periscope | 5000mAh 100W',
                    box_contents: 'Device, 100W GaN Fast Charger, USB-C 3.2 Cable, Protective Case, SIM Ejector'
                }),
                is_available: 1
            }
        ]
    },
    electronics_cyber: {
        store: {
            id: 9014,
            slug: 'demo-electronics-cyber',
            store_name: 'CyberX Pro Gaming Systems',
            bio: 'Custom liquid-cooled gaming rigs, rapid-trigger keyboards & 240Hz displays.',
            logo_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1600&h=650&q=80',
            template_slug: 'electronics_cyber',
            primary_color: '#1D4ED8',
            bank_name: 'GTBank',
            bank_account_number: '0129384752',
            bank_account_name: 'CyberX Systems Ltd',
            delivery_fee: 3000
        },
        items: [
            {
                id: 9503,
                title: 'CyberX Titan RGB Mechanical Gaming Keyboard (Hot-Swap)',
                category: 'Peripherals',
                description: 'CNC anodized aluminum gasket-mounted keyboard with pre-lubed Gateron magnetic switches, rapid trigger 0.1mm actuation, and per-key RGB.',
                price: 85000,
                compare_price: 110000,
                stock_quantity: 18,
                sku: 'CYB-KB-01',
                badge: '⚡ 0.1ms Response',
                image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v60', config: 'Magnetic Linear Switches (0.1mm Actuation)', price: 85000 },
                    { id: 'v61', config: 'Tactile Silent Switches', price: 88000 }
                ]),
                attributes_json: JSON.stringify({
                    configs: 'Magnetic Linear Switches (0.1mm Actuation), Tactile Silent Switches',
                    condition: 'Brand New (Tournament Edition)',
                    warranty: '24 Months Warranty',
                    specs_text: '8000Hz Polling Rate | Hot-Swappable | Gasket Mounted Aluminum Case'
                }),
                is_available: 1
            }
        ]
    },
    electronics_compare: {
        store: {
            id: 9015,
            slug: 'demo-electronics-compare',
            store_name: 'Certified Device Exchange',
            bio: '40-point inspection certified pre-owned & open-box Apple and flagship tech.',
            logo_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=200&h=200&q=80',
            cover_url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&h=650&q=80',
            cover_overlay_color: '#0B0F19',
            template_slug: 'electronics_compare',
            primary_color: '#0284C7',
            bank_name: 'Stanbic IBTC',
            bank_account_number: '0039485721',
            bank_account_name: 'Certified Device Hub',
            delivery_fee: 2500
        },
        items: [
            {
                id: 9504,
                title: 'Certified MacBook Pro 14" (M3 Pro / 18GB / 512GB SSD)',
                category: 'Certified Laptops',
                description: 'Passed comprehensive 40-point hardware diagnostic test. 100% battery health rating, pristine Liquid Retina XDR display, with full 12-month store warranty.',
                price: 1850000,
                compare_price: 2150000,
                stock_quantity: 5,
                sku: 'CERT-MBP-01',
                badge: 'Grade A+ Pristine',
                image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
                gallery_json: JSON.stringify([
                    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'
                ]),
                variants_json: JSON.stringify([
                    { id: 'v70', config: 'Space Black (Grade A+ Pristine)', price: 1850000 },
                    { id: 'v71', config: 'Silver (Factory Sealed New)', price: 2050000 }
                ]),
                attributes_json: JSON.stringify({
                    configs: 'Space Black (Grade A+ Pristine), Silver (Factory Sealed New)',
                    condition: 'Grade A+ (Pristine 100% Health)',
                    warranty: '12 Months Certified Replacement Warranty & Serial Seal',
                    specs_text: 'Apple M3 Pro (11-Core CPU, 14-Core GPU) | 18GB Unified Memory | 512GB Gen4 SSD'
                }),
                is_available: 1
            }
        ]
    }
};
/**
 * Get Sample Data for any template slug with fallback to general_clean
 */
export function getSampleDataForTemplate(templateSlug) {
    const normalized = String(templateSlug || '').toLowerCase().trim();
    if (SAMPLE_STORES_DATA[normalized]) {
        return SAMPLE_STORES_DATA[normalized];
    }
    if (normalized.includes('food') || normalized.includes('restaurant') || normalized.includes('bistro') || normalized.includes('menu')) {
        return SAMPLE_STORES_DATA.food_menu;
    }
    if (normalized.includes('fashion') || normalized.includes('boutique') || normalized.includes('lookbook') || normalized.includes('apparel')) {
        return SAMPLE_STORES_DATA.fashion_lookbook;
    }
    if (normalized.includes('beauty') || normalized.includes('cosmetic') || normalized.includes('glow') || normalized.includes('skincare')) {
        return SAMPLE_STORES_DATA.beauty_cosmetic;
    }
    if (normalized.includes('electronic') || normalized.includes('tech') || normalized.includes('gadget') || normalized.includes('device')) {
        return SAMPLE_STORES_DATA.electronics_tech;
    }
    return SAMPLE_STORES_DATA.general_clean;
}
