import crypto from 'crypto';
import { UserProfile, ValidationResult } from '../types';

/**
 * Common Utility Functions
 */

const CATEGORY_LOOKUP: Record<string, string> = (() => {
    const categoryNames: Record<string, string[]> = {
      web: ["web", "web exploitation"],
      crypto: ["crypto", "cryptography"],
      pwn: [
        "pwn",
        "pwnable",
        "binary exploitation",
        // Common CTF shorthand / variants
        "binex",
        "binexp",
        "binary",
        "exploit",
        "exploitation",
      ],
      reverse: [
        "reverse",
        "reverse engineering",
        "reversing",
        "rev",
        // Common shorthand
        "re",
      ],
      forensics: ["forensics", "forensic", "digital forensics"],
      misc: ["misc", "miscellaneous", "unknown", "other"],
      steganography: ["steganography", "stegano", "stego", "steg"],
      osint: ["osint", "open source intelligence", "open-source intelligence"],
      blockchain: ["blockchain", "blockchain exploitation", "web3", "smart contract"],
      mobile: ["mobile", "mobile exploitation", "mobile security"],
    };
  
    const map = Object.create(null) as Record<string, string>;
    for (const [canonical, aliases] of Object.entries(categoryNames)) {
      for (const a of aliases) {
        // simpan versi ter-normalisasi dari alias sebagai key
        map[a.toLowerCase().trim()] = canonical;
      }
    }
    return map;
  })();
  
  export function categoryNormalize(category: string): string {
    if (!category) return category;
    // normalisasi kecil: lowercase + trim + samakan dash/underscore/spasi ganda
    const key = category
      .toLowerCase()
      .trim()
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ");
  
    return CATEGORY_LOOKUP[key] ?? key;
  }
  

/**
 * Format error response consistently
 */
export function formatErrorResponse(status: number, error: string, message?: string, req?: any): any {
    return {
        error,
        message,
        ...(process.env.NODE_ENV === 'development' && req ? { 
            endpoint: `${req.method} ${req.path}`,
            params: req.params,
            query: req.query 
        } : {})
    };
}

/**
 * Validate common parameters
 */
export interface PaginationValidationOptions {
    defaultLimit?: number;
    maxLimit?: number;
    maxOffset?: number;
}

function parseUnsignedInteger(value: unknown, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

export function validatePaginationParams(
    limit?: unknown,
    offset?: unknown,
    options: PaginationValidationOptions = {},
): ValidationResult {
    const defaultLimit = options.defaultLimit ?? 10;
    const maxLimit = options.maxLimit ?? 100;
    const maxOffset = options.maxOffset ?? 100_000;
    const parsedLimit = parseUnsignedInteger(limit, defaultLimit);
    const parsedOffset = parseUnsignedInteger(offset, 0);

    if (parsedLimit === null) {
        return {
            isValid: false,
            error: "Limit must be a whole number",
            limit: defaultLimit,
            offset: parsedOffset ?? 0,
        };
    }

    if (parsedOffset === null) {
        return {
            isValid: false,
            error: "Offset must be a whole number",
            limit: parsedLimit,
            offset: 0,
        };
    }
    
    if (parsedLimit < 1 || parsedLimit > maxLimit) {
        return { 
            isValid: false, 
            error: `Limit must be between 1 and ${maxLimit}`,
            limit: parsedLimit, 
            offset: parsedOffset 
        };
    }
    
    if (parsedOffset < 0) {
        return { 
            isValid: false, 
            error: "Offset must be non-negative", 
            limit: parsedLimit, 
            offset: parsedOffset 
        };
    }

    if (parsedOffset > maxOffset) {
        return {
            isValid: false,
            error: `Offset must not exceed ${maxOffset}`,
            limit: parsedLimit,
            offset: parsedOffset,
        };
    }
    
    return { isValid: true, limit: parsedLimit, offset: parsedOffset };
}

export interface QueryStringValidationResult {
    isValid: boolean;
    value?: string;
    error?: string;
}

/**
 * Express query values are not necessarily strings: repeated or bracketed
 * parameters can become arrays/objects. Validate before a value reaches
 * string methods or a Mongo query.
 */
export function validateQueryString(
    value: unknown,
    name: string,
    maxLength: number = 200,
): QueryStringValidationResult {
    if (value === undefined) return { isValid: true };
    if (typeof value !== "string") {
        return { isValid: false, error: `${name} must be a single string` };
    }

    const normalized = value.trim();
    if (normalized.length > maxLength) {
        return {
            isValid: false,
            error: `${name} must not exceed ${maxLength} characters`,
        };
    }

    return {
        isValid: true,
        value: normalized || undefined,
    };
}

export interface QueryBooleanValidationResult {
    isValid: boolean;
    value: boolean;
    error?: string;
}

export function validateQueryBoolean(
    value: unknown,
    name: string,
    defaultValue: boolean,
): QueryBooleanValidationResult {
    if (value === undefined) return { isValid: true, value: defaultValue };
    if (value === "true") return { isValid: true, value: true };
    if (value === "false") return { isValid: true, value: false };
    return {
        isValid: false,
        value: defaultValue,
        error: `${name} must be true or false`,
    };
}

/**
 * Generate cache keys consistently
 */
export function generateCacheKey(prefix: string, query: any = {}): string {
    const queryString = Object.keys(query).length > 0 ? JSON.stringify(query) : 'global';
    return `${prefix}:${crypto.createHash('md5').update(queryString).digest('hex')}`;
}

/**
 * Escape user input for use in a RegExp constructor.
 */
export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isDiscordSnowflake(value: unknown): value is string {
    return typeof value === "string" && /^\d{17,20}$/.test(value);
}

export function normalizePublicHttpUrl(value: unknown): string {
    if (typeof value !== "string" || value.length > 2_048) return "";
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        if (url.username || url.password) return "";
        return url.toString();
    } catch {
        return "";
    }
}

/**
 * Filter users by search term
 */
export function filterUsersBySearch(userScores: Map<string, UserProfile>, searchTerm: string): Map<string, UserProfile> {
    if (!searchTerm || searchTerm.trim() === '') {
        return userScores;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    const filteredUsers = new Map<string, UserProfile>();
    
    for (const [discordId, profile] of userScores) {
        const username = profile.username.toLowerCase();
        const displayName = profile.displayName.toLowerCase();
        const userId = profile.userId.toLowerCase();
        
        // Check if search term matches user info or categories
        const matchesUser = username.includes(searchLower) || 
                           displayName.includes(searchLower) || 
                           userId.includes(searchLower);
        
        const matchesCategory = Array.from(profile.categories).some(category => 
            category.toLowerCase().includes(searchLower)
        );
        
        if (matchesUser || matchesCategory) {
            filteredUsers.set(discordId, profile);
        }
    }
    
    return filteredUsers;
}
