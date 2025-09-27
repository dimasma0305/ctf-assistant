import crypto from 'crypto';
import { UserProfile, ValidationResult } from '../types';

/**
 * Common Utility Functions
 */

const CATEGORY_LOOKUP: Record<string, string> = (() => {
    const categoryNames: Record<string, string[]> = {
      web: ["web", "web exploitation"],
      crypto: ["crypto", "cryptography"],
      pwn: ["pwn", "pwnable", "binary exploitation"],
      reverse: ["reverse", "reverse engineering", "reversing", "rev"],
      forensics: ["forensics", "forensic", "digital forensics"],
      misc: ["misc", "miscellaneous"],
      steganography: ["steganography", "stegano"],
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
export function validatePaginationParams(limit?: string, offset?: string): ValidationResult {
    const parsedLimit = parseInt(limit as string) || 10;
    const parsedOffset = parseInt(offset as string) || 0;
    
    if (parsedLimit < 1 || parsedLimit > 100) {
        return { 
            isValid: false, 
            error: "Limit must be between 1 and 100", 
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
    
    return { isValid: true, limit: parsedLimit, offset: parsedOffset };
}

/**
 * Generate cache keys consistently
 */
export function generateCacheKey(prefix: string, query: any = {}): string {
    const queryString = Object.keys(query).length > 0 ? JSON.stringify(query) : 'global';
    return `${prefix}:${crypto.createHash('md5').update(queryString).digest('hex')}`;
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
