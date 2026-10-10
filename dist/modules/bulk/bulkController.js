import { dbFetchOne, dbFetchAll, dbInsert } from '../../db/db.js';
import { getStorePlanDetails } from '../../utils/helpers.js';
export const bulkRoutes = async (fastify) => {
    // 1. Download Sample Products CSV Template
    fastify.get('/api/merchant/items/sample-csv', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const csvContent = [
            'Title,Category,Price,Compare Price,Stock Quantity,Low Stock Threshold,SKU,Description,Image URL,Is Preorder,Preorder Date',
            '"Classic Oxford Cotton Shirt","Fashion",15000,18000,50,5,"SHIRT-OXF-01","Premium breathable cotton casual shirt","https://images.unsplash.com/photo-1596755094514-f87e34085b2c",0,""',
            '"Smoky Jollof & Grilled Chicken","Food & Restaurant",4500,5000,100,10,"FOOD-JOL-01","Authentic party jollof with spicy grilled quarter chicken","https://images.unsplash.com/photo-1604382355076-af4b0eb60143",0,""',
            '"Glow Boost Niacinamide Serum","Beauty",8500,10000,40,4,"BEAUTY-SER-01","Hydrating and radiant serum with 10% niacinamide","https://images.unsplash.com/photo-1620916566398-39f1143ab7be",0,""',
            '"Wireless ANC Earbuds Pro","Electronics",28000,35000,25,3,"TECH-EAR-01","Active noise cancelling bluetooth 5.3 earbuds","https://images.unsplash.com/photo-1590658268037-6bf12165a8df",1,"2026-11-20"'
        ].join('\r\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="zlik_products_template.csv"');
        return reply.send(csvContent);
    });
    // 2. CSV Bulk Product Import Endpoint
    fastify.post('/api/merchant/items/import-csv', async (req, reply) => {
        const store = req.session?.merchantStore;
        if (!store)
            return reply.code(401).send({ success: false, error: 'Unauthorized: Merchant login required' });
        const currentStore = dbFetchOne('stores', { id: store.id }) || store;
        const { config, isPro } = getStorePlanDetails(currentStore);
        const body = (req.body || {});
        const csvData = typeof body.csv === 'string' ? body.csv.trim() : '';
        if (!csvData) {
            return reply.code(400).send({ success: false, error: 'No CSV content provided for import' });
        }
        // Check existing item count vs plan allowance
        const existingItems = dbFetchAll('items', { store_id: currentStore.id });
        const productLimit = config.limits.max_products;
        // Parse CSV rows handling quotes and comma delimiters
        const lines = parseCSVRows(csvData);
        if (lines.length < 2) {
            return reply.code(400).send({ success: false, error: 'CSV file contains no valid product rows (header only or empty)' });
        }
        const headers = lines[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const rows = lines.slice(1);
        const titleIdx = headers.findIndex(h => h === 'title' || h === 'product_title' || h === 'name');
        const categoryIdx = headers.findIndex(h => h === 'category' || h === 'category_name');
        const priceIdx = headers.findIndex(h => h === 'price' || h === 'unit_price' || h === 'base_price');
        const comparePriceIdx = headers.findIndex(h => h.includes('compare') || h.includes('original_price'));
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity'));
        const lowStockIdx = headers.findIndex(h => h.includes('low_stock') || h.includes('threshold'));
        const skuIdx = headers.findIndex(h => h === 'sku' || h === 'item_code' || h === 'barcode');
        const descIdx = headers.findIndex(h => h === 'description' || h === 'desc' || h === 'details');
        const imageIdx = headers.findIndex(h => h.includes('image') || h.includes('photo') || h.includes('url'));
        const preOrderIdx = headers.findIndex(h => h.includes('preorder') || h.includes('pre_order'));
        const preOrderDateIdx = headers.findIndex(h => h.includes('preorder_date') || h.includes('dispatch_date'));
        if (titleIdx === -1 || priceIdx === -1) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid CSV format: Columns "Title" and "Price" are required.'
            });
        }
        let importedCount = 0;
        const errors = [];
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.length === 0 || row.every(c => !c.trim()))
                continue;
            // Enforce product limit check
            if (productLimit !== Infinity && (existingItems.length + importedCount) >= productLimit) {
                errors.push(`Row ${i + 2}: Reached product limit of ${productLimit} items for your plan. Please upgrade to Pro or Business to add more.`);
                break;
            }
            const title = row[titleIdx]?.trim();
            const rawPrice = row[priceIdx]?.replace(/[^0-9.]/g, '');
            const price = parseFloat(rawPrice || '0');
            if (!title) {
                errors.push(`Row ${i + 2}: Missing product title`);
                continue;
            }
            if (isNaN(price) || price < 0) {
                errors.push(`Row ${i + 2}: Invalid price value "${row[priceIdx]}"`);
                continue;
            }
            const category = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].trim() : 'General';
            const comparePriceRaw = comparePriceIdx !== -1 && row[comparePriceIdx] ? row[comparePriceIdx].replace(/[^0-9.]/g, '') : null;
            const comparePrice = comparePriceRaw && !isNaN(parseFloat(comparePriceRaw)) ? parseFloat(comparePriceRaw) : null;
            const stockRaw = stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx].replace(/[^0-9]/g, '')) : 50;
            const stock = isNaN(stockRaw) ? 50 : stockRaw;
            const lowStockRaw = lowStockIdx !== -1 && row[lowStockIdx] ? parseInt(row[lowStockIdx].replace(/[^0-9]/g, '')) : 5;
            const lowStock = isNaN(lowStockRaw) ? 5 : lowStockRaw;
            const sku = skuIdx !== -1 && row[skuIdx] ? row[skuIdx].trim() : null;
            const description = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : null;
            const imageUrl = imageIdx !== -1 && row[imageIdx] ? row[imageIdx].trim() : null;
            const isPreorder = preOrderIdx !== -1 && (row[preOrderIdx] === '1' || row[preOrderIdx]?.toLowerCase() === 'yes' || row[preOrderIdx]?.toLowerCase() === 'true') ? 1 : 0;
            const preorderDate = preOrderDateIdx !== -1 && row[preOrderDateIdx] ? row[preOrderDateIdx].trim() : null;
            try {
                dbInsert('items', {
                    store_id: currentStore.id,
                    title,
                    category,
                    price,
                    compare_price: comparePrice,
                    stock_quantity: stock,
                    low_stock_threshold: lowStock,
                    sku,
                    description,
                    image_url: imageUrl,
                    is_preorder: isPreorder,
                    preorder_dispatch_date: preorderDate,
                    is_available: 1,
                    created_at: now,
                    updated_at: now
                });
                importedCount++;
            }
            catch (err) {
                errors.push(`Row ${i + 2}: ${err.message || 'Database insert failed'}`);
            }
        }
        return reply.send({
            success: true,
            imported_count: importedCount,
            total_products: existingItems.length + importedCount,
            errors
        });
    });
};
/**
 * Robust CSV parser that correctly handles quoted values containing commas and newlines
 */
function parseCSVRows(text) {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentVal += '"';
                i++; // skip escaped quote
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (char === ',' && !inQuotes) {
            currentRow.push(currentVal);
            currentVal = '';
        }
        else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // skip \n in CRLF
            }
            currentRow.push(currentVal);
            currentVal = '';
            if (currentRow.some(c => c.trim().length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
        }
        else {
            currentVal += char;
        }
    }
    if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal);
        if (currentRow.some(c => c.trim().length > 0)) {
            rows.push(currentRow);
        }
    }
    return rows;
}
