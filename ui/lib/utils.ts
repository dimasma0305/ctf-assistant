import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
