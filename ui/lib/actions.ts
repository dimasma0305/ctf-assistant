"use client"

import type {
  ScoreboardResponse,
  UserProfileResponse,
  CTFProfileResponse,
  CTFsResponse,
  CTFDetailsResponse,
  CacheStatusResponse,
  CTFRankingsResponse,
  CertificateResponse,
  SingleCertificateResponse,
  ScoreboardParams,
  CTFsParams,
  CTFRankingsParams,
  APIError,
} from "./types"

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.assistant.1pc.tf/"

// Generic API fetch wrapper with error handling
async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
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
    throw new Error("An unexpected error occurred")
  }
}

// Build query string from params
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value))
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ""
}

/**
 * Fetch scoreboard/leaderboard data
 */
export async function getScoreboard(params: ScoreboardParams = {}): Promise<ScoreboardResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<ScoreboardResponse>(`/api/scoreboard${queryString}`)
}

/**
 * Fetch user profile data from the global profile endpoint
 */
export async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  return fetchAPI<UserProfileResponse>(`/api/profile/${userId}`)
}

/**
 * Fetch CTF-specific user profile
 */
export async function getCTFProfile(ctfId: string, userId: string): Promise<CTFProfileResponse> {
  return fetchAPI<CTFProfileResponse>(`/api/profile/${userId}/ctf/${ctfId}`)
}

/**
 * Fetch CTFs list with filtering options
 */
export async function getCTFs(params: CTFsParams = {}): Promise<CTFsResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<CTFsResponse>(`/api/ctfs${queryString}`)
}

/**
 * Fetch CTF rankings with leaderboard data
 */
export async function getCTFRankings(params: CTFRankingsParams = {}): Promise<CTFRankingsResponse> {
  const queryString = buildQueryString(params)
  return fetchAPI<CTFRankingsResponse>(`/api/ctfs/rankings${queryString}`)
}

/**
 * Fetch detailed information about a specific CTF
 */
export async function getCTFDetails(ctfId: string): Promise<CTFDetailsResponse> {
  return fetchAPI<CTFDetailsResponse>(`/api/ctfs/${ctfId}`)
}

/**
 * Fetch cache status
 */
export async function getCacheStatus(): Promise<CacheStatusResponse> {
  return fetchAPI<CacheStatusResponse>("/api/cache/status")
}

/**
 * Clear cache
 */
export async function clearCache(): Promise<{ message: string; clearedEntries: number; timestamp: string }> {
  return fetchAPI("/api/cache/clear", { method: "DELETE" })
}

/**
 * Warm cache
 */
export async function warmCache(): Promise<{ message: string; statistics: any; timestamp: string }> {
  return fetchAPI("/api/cache/warm", { method: "POST" })
}

/**
 * Check API health
 */
export async function getHealth(): Promise<{
  status: string
  bot: {
    ready: boolean
    waitingForSessionReset: boolean
  }
  timestamp: string
}> {
  return fetchAPI("/health")
}

/**
 * Fetch user certificates
 */
export async function getCertificates(userId: string): Promise<CertificateResponse> {
  return fetchAPI<CertificateResponse>(`/api/certificates/${userId}`)
}

/**
 * Fetch a specific certificate
 */
export async function getCertificate(userId: string, period: string): Promise<SingleCertificateResponse> {
  return fetchAPI<SingleCertificateResponse>(`/api/certificates/${userId}/${period}`)
}
