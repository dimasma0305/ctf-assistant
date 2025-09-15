import {
  ScoreboardResponse,
  UserProfileResponse,
  CTFProfileResponse,
  CTFsResponse,
  CTFDetailsResponse,
  CacheStatusResponse,
  CTFRankingsResponse,
  ScoreboardParams,
  CTFsParams,
  CTFRankingsParams,
  APIError,
} from './types'

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'

// Generic API fetch wrapper with error handling
async function fetchAPI<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData: APIError = await response.json().catch(() => ({
        error: `HTTP ${response.status}`,
        message: response.statusText,
      }))
      throw new Error(errorData.message || errorData.error)
    }

    return response.json()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred')
  }
}

// Build query string from params
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  })
  
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

// API Functions

/**
 * Fetch scoreboard/leaderboard data
 */
export async function fetchScoreboard(params: ScoreboardParams = {}): Promise<ScoreboardResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<ScoreboardResponse>(`/api/scoreboard${queryString}`)
}

/**
 * Fetch user profile data
 */
export async function fetchUserProfile(userId: string): Promise<UserProfileResponse> {
  return fetchAPI<UserProfileResponse>(`/api/profile/${userId}`)
}

/**
 * Fetch CTF-specific user profile
 */
export async function fetchCTFProfile(ctfId: string, userId: string): Promise<CTFProfileResponse> {
  return fetchAPI<CTFProfileResponse>(`/api/ctf/${ctfId}/profile/${userId}`)
}

/**
 * Fetch CTFs list with filtering options
 */
export async function fetchCTFs(params: CTFsParams = {}): Promise<CTFsResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<CTFsResponse>(`/api/ctfs${queryString}`)
}

/**
 * Fetch CTF rankings with leaderboard data
 */
export async function fetchCTFRankings(params: CTFRankingsParams = {}): Promise<CTFRankingsResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<CTFRankingsResponse>(`/api/ctfs/rankings${queryString}`)
}

/**
 * Fetch detailed information about a specific CTF
 */
export async function fetchCTFDetails(ctfId: string): Promise<CTFDetailsResponse> {
  return fetchAPI<CTFDetailsResponse>(`/api/ctfs/${ctfId}`)
}

/**
 * Fetch cache status
 */
export async function fetchCacheStatus(): Promise<CacheStatusResponse> {
  return fetchAPI<CacheStatusResponse>('/api/cache/status')
}

/**
 * Clear cache
 */
export async function clearCache(): Promise<{ message: string; clearedEntries: number; timestamp: string }> {
  return fetchAPI('/api/cache/clear', { method: 'DELETE' })
}

/**
 * Warm cache
 */
export async function warmCache(): Promise<{ message: string; statistics: any; timestamp: string }> {
  return fetchAPI('/api/cache/warm', { method: 'POST' })
}

/**
 * Check API health
 */
export async function fetchHealth(): Promise<{
  status: string
  bot: {
    ready: boolean
    waitingForSessionReset: boolean
  }
  timestamp: string
}> {
  return fetchAPI('/health')
}

// Hook-like functions for React components
export class APIClient {
  static async getLeaderboard(params?: ScoreboardParams) {
    return fetchScoreboard(params)
  }

  static async getUserProfile(userId: string) {
    return fetchUserProfile(userId)
  }

  static async getCTFProfile(ctfId: string, userId: string) {
    return fetchCTFProfile(ctfId, userId)
  }

  static async getCTFs(params?: CTFsParams) {
    return fetchCTFs(params)
  }

  static async getCTFRankings(params?: CTFRankingsParams) {
    return fetchCTFRankings(params)
  }

  static async getCTFDetails(ctfId: string) {
    return fetchCTFDetails(ctfId)
  }

  static async getCacheStatus() {
    return fetchCacheStatus()
  }

  static async clearCache() {
    return clearCache()
  }

  static async warmCache() {
    return warmCache()
  }

  static async getHealth() {
    return fetchHealth()
  }
}

export default APIClient
