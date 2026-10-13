/**
 * Zlik Storefront Naming Rules & Brand Protection Validator
 * 
 * Enforces:
 * 1. Prohibition of corporate designations (Ltd, Plc, Holdings, etc.) for personal sellers.
 * 2. Strict restriction of institutional, regulatory, and government terms (Bank, CBN, EFCC, etc.).
 * 3. Prevention of unauthorized brand impersonation (Apple, Nike, Dangote, Jumia, etc.).
 * 4. Detection of deceptive typo-squatting or evasive character substitutions.
 */

export interface StoreNameValidationResult {
  valid: boolean;
  reason?: string;
  category?: 'corporate_designator' | 'institutional' | 'brand_impersonation' | 'invalid_format' | 'prohibited';
  matchedTerm?: string;
}

// 1. Corporate designations restricted under Nigerian CAMA 2020 for unverified personal sellers
export const RESTRICTED_CORPORATE_DESIGNATORS = [
  'plc',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'holdings',
  'group',
  'llc',
  'gtd'
];

// 2. Institutional, regulatory, and platform terms strictly prohibited for all standard storefronts
export const RESTRICTED_INSTITUTIONAL_TERMS = [
  'bank',
  'cbn',
  'central bank',
  'microfinance',
  'mfb',
  'mortgage bank',
  'fintech',
  'official zlik',
  'zlik support',
  'zlik team',
  'zlik admin',
  'zlik official',
  'zlik store',
  'zlik care',
  'government',
  'federal',
  'state ministry',
  'ministry of',
  'police',
  'army',
  'customs',
  'immigration',
  'efcc',
  'ndlea',
  'nnpc',
  'firs',
  'court',
  'judiciary',
  'cac',
  'corporate affairs commission'
];

// 3. Established consumer, corporate, and financial brands protected from impersonation
export const PROTECTED_BRANDS = [
  // Global Tech & Electronics
  'apple',
  'iphone',
  'samsung',
  'galaxy',
  'google',
  'microsoft',
  'sony',
  'playstation',
  'tecno',
  'infinix',
  'oraimo',
  'xiaomi',
  'redmi',
  'huawei',
  'dell',
  'lenovo',
  // Global Apparel & Fashion
  'nike',
  'adidas',
  'zara',
  'gucci',
  'louis vuitton',
  'rolex',
  'balenciaga',
  'dior',
  'chanel',
  'prada',
  'puma',
  'versace',
  'armani',
  // Nigerian Corporate & E-Commerce
  'dangote',
  'jumia',
  'konga',
  'bua',
  // Nigerian Commercial Banks & Fintechs
  'gtbank',
  'gtco',
  'access bank',
  'zenith bank',
  'first bank',
  'uba',
  'stanbic',
  'kuda',
  'opay',
  'palmpay',
  'moniepoint',
  'flutterwave',
  'paystack',
  'interswitch',
  // Telecoms
  'mtn',
  'airtel',
  'glo',
  '9mobile'
];

/**
 * Calculates Levenshtein edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Normalizes text and maps common l33t-speak / typo-squatting substitutions
 */
function normalizeSubstitutions(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[\._\-+]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Validates a proposed storefront name against Zlik Trust & Security rules
 */
export function validateStoreName(
  storeName: string,
  sellerType: 'personal' | 'business' = 'personal',
  isVerifiedBusiness: boolean = false
): StoreNameValidationResult {
  if (!storeName || typeof storeName !== 'string') {
    return {
      valid: false,
      reason: 'Store name is required.',
      category: 'invalid_format'
    };
  }

  const trimmed = storeName.trim();
  if (trimmed.length < 2) {
    return {
      valid: false,
      reason: 'Store name must be at least 2 characters long.',
      category: 'invalid_format'
    };
  }

  if (trimmed.length > 60) {
    return {
      valid: false,
      reason: 'Store name cannot exceed 60 characters.',
      category: 'invalid_format'
    };
  }

  // Reject purely numbers or symbols
  if (!/[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      reason: 'Store name must contain at least one letter.',
      category: 'invalid_format'
    };
  }

  const lowerRaw = trimmed.toLowerCase();
  const substituted = normalizeSubstitutions(trimmed);
  const rawTokens = lowerRaw.split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const substitutedTokens = substituted.split(/\s+/).filter(Boolean);

  // 1. Check Institutional / Regulatory / Government Terms (Strictly prohibited for all storefronts)
  for (const term of RESTRICTED_INSTITUTIONAL_TERMS) {
    const termTokens = term.split(/\s+/);
    if (termTokens.length === 1) {
      if (rawTokens.includes(term) || substitutedTokens.includes(term)) {
        return {
          valid: false,
          reason: `Store name cannot contain restricted institutional term "${term.toUpperCase()}". Zlik prohibits storefront names implying government, regulatory, banking, or platform authority.`,
          category: 'institutional',
          matchedTerm: term
        };
      }
    } else {
      // Multi-word phrase check
      if (lowerRaw.includes(term) || substituted.includes(term)) {
        return {
          valid: false,
          reason: `Store name cannot contain restricted institutional phrase "${term}". Storefronts cannot imply official government, banking, or platform authority.`,
          category: 'institutional',
          matchedTerm: term
        };
      }
    }
  }

  // 2. Check Corporate Designators (Prohibited for personal sellers without verified CAC status)
  if (sellerType === 'personal' || !isVerifiedBusiness) {
    for (const designator of RESTRICTED_CORPORATE_DESIGNATORS) {
      if (rawTokens.includes(designator) || substitutedTokens.includes(designator)) {
        return {
          valid: false,
          reason: `Personal seller accounts cannot use corporate designations such as "${designator.toUpperCase()}". Under Nigerian business regulations, corporate names require verified CAC company registration.`,
          category: 'corporate_designator',
          matchedTerm: designator
        };
      }
    }
  }

  // 3. Check Brand Impersonation (Protected brands)
  for (const brand of PROTECTED_BRANDS) {
    const brandTokens = brand.split(/\s+/);

    if (brandTokens.length === 1) {
      // Direct token match (e.g. "Apple", "Nike", "Dangote")
      if (rawTokens.includes(brand) || substitutedTokens.includes(brand)) {
        return {
          valid: false,
          reason: `Store name cannot impersonate protected brand "${brand.toUpperCase()}". Unauthorized use of registered trademarks and established brands is prohibited.`,
          category: 'brand_impersonation',
          matchedTerm: brand
        };
      }

      // Typo-squatting detection on tokens of similar length (edit distance <= 1 for tokens >= 4 chars)
      if (brand.length >= 4) {
        for (const token of substitutedTokens) {
          // Ignore if token is identical or length differs by more than 1
          if (Math.abs(token.length - brand.length) <= 1 && token !== brand) {
            const dist = levenshteinDistance(token, brand);
            if (dist === 1 && brand.length >= 4) {
              return {
                valid: false,
                reason: `Store name "${trimmed}" appears deceptive or deceptively similar to protected brand "${brand.toUpperCase()}". Please choose an original brand name.`,
                category: 'brand_impersonation',
                matchedTerm: brand
              };
            }
          }
        }
      }
    } else {
      // Multi-word brand phrase (e.g. "Access Bank", "Louis Vuitton")
      if (lowerRaw.includes(brand) || substituted.includes(brand)) {
        return {
          valid: false,
          reason: `Store name cannot impersonate protected brand "${brand}". Unauthorized use of registered trademarks is prohibited.`,
          category: 'brand_impersonation',
          matchedTerm: brand
        };
      }
    }
  }

  return {
    valid: true
  };
}
