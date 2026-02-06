import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Achievement, getAchievement } from "./achievements"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate percentile from rank and total participants
 * @param rank - User's rank (1-based, where 1 is the best)
 * @param total - Total number of participants
 * @returns Percentile rank (0-100) where lower ranks get higher percentiles
 *
 * Examples:
 * - Rank 1 of 7 users = 14.3% (top performer, low percentile number)
 * - Rank 4 of 7 users = 57.1% (middle performer)
 * - Rank 7 of 7 users = 100% (bottom performer, high percentile number)
 */
export function calculatePercentile(rank: number, total: number): number {
  if (total <= 0 || rank <= 0 || rank > total) {
    return 0
  }

  // Formula: (rank / total) * 100
  // This shows what percentile you're in (lower ranks get lower percentiles)
  return Math.round((rank / total) * 100)
}


/**
 * Process achievements - handles both Achievement objects and achievement IDs
 * @param achievements - Array of Achievement objects or achievement ID strings
 * @returns Array of Achievement objects
 */
export function getAchievements(achievements: (Achievement | string)[]): Achievement[] {
  const processedAchievements: Achievement[] = [];
  
  for (const achievement of achievements) {
    if (typeof achievement === 'string') {
      // It's an achievement ID, fetch the full achievement
      try {
        processedAchievements.push(getAchievement(achievement));
      } catch {
        console.warn(`Unknown achievement ID: ${achievement}`);
      }
    } else {
      // It's already a full Achievement object
      processedAchievements.push(achievement);
    }
  }
  
  return processedAchievements;
}

/**
 * Unified Category Color System
 * 
 * Get consistent color for CTF challenge categories across the entire application.
 * This function ensures visual consistency for challenge categories throughout 
 * leaderboards, profiles, and other components.
 * 
 * Supported Categories:
 * - web (blue), crypto (purple), pwn (red), reverse (green)
 * - forensics (yellow), misc (gray), steganography (pink)
 * - osint (cyan), blockchain (orange), hardware (indigo)
 * - mobile (teal), networking (lime), ai (violet), quantum (rose)
 * 
 * @param category - Challenge category name (case-insensitive)
 * @returns Tailwind CSS background color class (e.g., 'bg-blue-500')
 */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    web: "bg-blue-500",
    crypto: "bg-purple-500",
    pwn: "bg-red-500",
    reverse: "bg-green-500",
    forensics: "bg-yellow-500",
    misc: "bg-gray-500",
    // Additional category mappings
    steganography: "bg-pink-500",
    osint: "bg-cyan-500",
    blockchain: "bg-orange-500",
    hardware: "bg-indigo-500",
    mobile: "bg-teal-500",
    networking: "bg-lime-500",
    ai: "bg-violet-500",
    quantum: "bg-rose-500",
  };
  
  // Normalize category name (lowercase, trim whitespace)
  const normalizedCategory = category.toLowerCase().trim();
  
  return colors[normalizedCategory] || "bg-gray-500";
}

/**
 * Get text color that contrasts well with the category color
 * @param category - Challenge category name
 * @returns Tailwind CSS text color class
 */
export function getCategoryTextColor(category: string): string {
  const normalizedCategory = category.toLowerCase().trim();
  // Yellow backgrounds need dark text for contrast.
  if (normalizedCategory === "forensics") return "text-black";
  return "text-white";
}

/**
 * Get category color with opacity variant
 * @param category - Challenge category name
 * @param opacity - Opacity level (10, 20, 30, etc.)
 * @returns Tailwind CSS background color class with opacity
 */
export function getCategoryColorWithOpacity(category: string, opacity: number = 20): string {
  const baseColor = getCategoryColor(category);
  // Replace 'bg-' with 'bg-' and add opacity
  const colorName = baseColor.replace('bg-', '').replace('-500', '');
  return `bg-${colorName}-500/${opacity}`;
}
