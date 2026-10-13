"use strict";
/**
 * Advanced Name Matching Engine for Nigerian Commercial Banking
 * Computes Token Overlap, Jaro-Winkler String Distance, and Entity Normalization.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateNameMatch = void 0;
exports.normalizeTokens = normalizeTokens;
exports.removeCorporateSuffixes = removeCorporateSuffixes;
exports.jaroWinklerDistance = jaroWinklerDistance;
exports.tokenOverlapScore = tokenOverlapScore;
exports.matchAccountName = matchAccountName;
// Corporate entity and trade noise tokens to normalize
const CORPORATE_SUFFIXES = new Set([
    'ltd', 'limited', 'plc', 'enterprises', 'enterprise', 'ent',
    'ventures', 'venture', 'services', 'service', 'global',
    'resources', 'concept', 'concepts', 'integrated', 'solutions',
    'solution', 'stores', 'store', 'boutique', 'consulting',
    'trading', 'logistics', 'intl', 'international', 'holdings',
    'nigeria', 'nig', 'group', 'company', 'co'
]);
/**
 * Clean and tokenize a name string
 */
function normalizeTokens(str) {
    if (!str)
        return [];
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 1);
}
/**
 * Filter out generic corporate suffixes for business matching
 */
function removeCorporateSuffixes(tokens) {
    return tokens.filter(t => !CORPORATE_SUFFIXES.has(t));
}
/**
 * Standard Jaro-Winkler Distance Calculation
 * Returns score between 0.0 (no similarity) and 1.0 (identical)
 */
function jaroWinklerDistance(s1, s2) {
    const str1 = (s1 || '').trim().toLowerCase();
    const str2 = (s2 || '').trim().toLowerCase();
    if (str1 === str2)
        return 1.0;
    if (str1.length === 0 || str2.length === 0)
        return 0.0;
    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const str1Matches = new Array(str1.length).fill(false);
    const str2Matches = new Array(str2.length).fill(false);
    let matches = 0;
    for (let i = 0; i < str1.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, str2.length);
        for (let j = start; j < end; j++) {
            if (str2Matches[j] || str1[i] !== str2[j])
                continue;
            str1Matches[i] = true;
            str2Matches[j] = true;
            matches++;
            break;
        }
    }
    if (matches === 0)
        return 0.0;
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
        if (!str1Matches[i])
            continue;
        while (!str2Matches[k])
            k++;
        if (str1[i] !== str2[k])
            transpositions++;
        k++;
    }
    const jaro = (matches / str1.length +
        matches / str2.length +
        (matches - transpositions / 2) / matches) /
        3;
    // Winkler prefix scaling (up to 4 characters prefix bonus)
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(str1.length, str2.length)); i++) {
        if (str1[i] === str2[i])
            prefix++;
        else
            break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
}
/**
 * Token Overlap Ratio with Jaro-Winkler Fallback
 */
function tokenOverlapScore(tokensA, tokensB) {
    if (tokensA.length === 0 || tokensB.length === 0)
        return 0.0;
    let matchScore = 0;
    const usedB = new Set();
    for (const tokenA of tokensA) {
        let bestMatch = 0;
        let bestIndex = -1;
        for (let j = 0; j < tokensB.length; j++) {
            if (usedB.has(j))
                continue;
            const jw = jaroWinklerDistance(tokenA, tokensB[j]);
            if (jw > bestMatch) {
                bestMatch = jw;
                bestIndex = j;
            }
        }
        if (bestMatch >= 0.85 && bestIndex !== -1) {
            matchScore += bestMatch;
            usedB.add(bestIndex);
        }
    }
    const totalTokens = Math.max(tokensA.length, tokensB.length);
    return Math.min(1.0, matchScore / totalTokens);
}
/**
 * Complete Name Matching Evaluation between Seller Legal/Store Name and Bank Account Name
 */
function matchAccountName(sellerName, accountName, isBusiness = false) {
    const normSeller = (sellerName || '').trim();
    const normAccount = (accountName || '').trim();
    let tokensA = normalizeTokens(normSeller);
    let tokensB = normalizeTokens(normAccount);
    if (isBusiness) {
        const strippedA = removeCorporateSuffixes(tokensA);
        const strippedB = removeCorporateSuffixes(tokensB);
        if (strippedA.length > 0)
            tokensA = strippedA;
        if (strippedB.length > 0)
            tokensB = strippedB;
    }
    if (tokensA.length === 0 || tokensB.length === 0) {
        return {
            score: 0.0,
            matchType: 'mismatch',
            isAcceptable: false,
            flagForManualReview: true,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'One or both names could not be tokenized'
        };
    }
    // 1. Exact string match
    if (normSeller.toLowerCase() === normAccount.toLowerCase()) {
        return {
            score: 1.0,
            matchType: 'exact_match',
            isAcceptable: true,
            flagForManualReview: false,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'Exact character-for-character match'
        };
    }
    // 2. Token set identical (e.g., "Chinedu Eze" vs "Eze Chinedu")
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    if (tokensA.length === tokensB.length && [...setA].every(t => setB.has(t))) {
        return {
            score: 1.0,
            matchType: 'exact_match',
            isAcceptable: true,
            flagForManualReview: false,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'Full token match with different word ordering'
        };
    }
    // 2b. Subset name match (e.g. middle name omitted: "Emeka John Okafor" vs "Emeka Okafor")
    const minTokens = Math.min(tokensA.length, tokensB.length);
    if (minTokens >= 2 && (tokensA.every(t => setB.has(t)) || tokensB.every(t => setA.has(t)))) {
        return {
            score: 0.85,
            matchType: 'fuzzy_match',
            isAcceptable: true,
            flagForManualReview: false,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'Subset name match (middle name omitted or included)'
        };
    }
    // 3. Token Overlap & Fuzzy Jaro-Winkler Score
    const score = tokenOverlapScore(tokensA, tokensB);
    if (score >= 0.8) {
        return {
            score,
            matchType: 'fuzzy_match',
            isAcceptable: true,
            flagForManualReview: false,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'High-confidence fuzzy match (minor abbreviation or spelling variant)'
        };
    }
    else if (score >= 0.5) {
        return {
            score,
            matchType: 'partial_match',
            isAcceptable: false,
            flagForManualReview: true,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'Partial name match. Queued for Super Admin manual review.'
        };
    }
    else {
        return {
            score,
            matchType: 'mismatch',
            isAcceptable: false,
            flagForManualReview: false,
            normalizedSellerName: normSeller,
            normalizedAccountName: normAccount,
            confidenceDescription: 'Names do not match registered merchant profile'
        };
    }
}
exports.evaluateNameMatch = matchAccountName;
