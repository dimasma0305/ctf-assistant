"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  getScoreboard,
  getUserProfile,
  getCTFProfile,
  getCTFs,
  getCTFDetails,
  getCacheStatus,
  getHealth,
  clearCache as clearCacheAction,
  warmCache as warmCacheAction,
  getCTFRankings,
  getCertificates,
  getCertificate,
} from "@/lib/actions"
import type { ScoreboardParams, CTFsParams, CertificateResponse, SingleCertificateResponse } from "@/lib/types"

// Generic API hook
function useAPICall<T>(
  apiCall: () => Promise<T>,
  dependencies: any[] = [],
  options: {
    cacheKey?: string
    ttl?: number
    enabled?: boolean
    staleWhileRevalidate?: boolean
  } = {},
) {
  const { cacheKey, ttl = 5 * 60 * 1000, enabled = true, staleWhileRevalidate = false } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isStale, setIsStale] = useState(false)

  const lastFetchRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(
    async (isRetry = false, forceRefresh = false) => {
      if (!enabled) return

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      if (!isRetry && !forceRefresh) {
        setLoading(true)
        setIsStale(false)
      }
      setError(null)

      try {
        let result: T

        if (cacheKey && !forceRefresh) {
          // Use cached data with stale-while-revalidate
          const cached = dataCache.get<T>(cacheKey)
          if (cached !== null) {
            setData(cached)
            setLoading(false)

            if (staleWhileRevalidate) {
              setIsStale(true)
              // Fetch fresh data in background
              setTimeout(() => {
                fetchData(false, true)
              }, 100)
              return
            }
          }

          result = await dataCache.getOrFetch(cacheKey, apiCall, ttl)
        } else {
          result = await apiCall()
        }

        if (!controller.signal.aborted) {
          setData(result)
          setRetryCount(0)
          setIsStale(false)
          lastFetchRef.current = Date.now()
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const errorMessage = err instanceof Error ? err.message : "An error occurred"
          setError(errorMessage)

          // Retry logic for network errors
          if (retryCount < 2 && (errorMessage.includes("fetch") || errorMessage.includes("network"))) {
            setTimeout(
              () => {
                setRetryCount((prev) => prev + 1)
                fetchData(true)
              },
              1000 * Math.pow(2, retryCount), // Exponential backoff
            )
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    },
    [...dependencies, retryCount, enabled, cacheKey, ttl],
  )

  useEffect(() => {
    fetchData()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchData])

  const invalidateCache = useCallback(() => {
    if (cacheKey) {
      dataCache.invalidate(cacheKey)
    }
  }, [cacheKey])

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    retryCount,
    isStale,
    invalidateCache,
    lastFetch: lastFetchRef.current,
  }
}

// Scoreboard hook
export function useScoreboard(initialParams: ScoreboardParams = {}) {
  const [currentParams, setCurrentParams] = useState(initialParams)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `scoreboard:${paramsKey}`

  const result = useAPICall(() => getScoreboard(currentParams), [paramsKey], {
    cacheKey,
    ttl: 2 * 60 * 1000, // 2 minutes for leaderboard
    staleWhileRevalidate: true,
  })

  const updateParams = useCallback((newParams: Partial<ScoreboardParams>) => {
    setCurrentParams((prev) => {
      const updated = { ...prev, ...newParams }
      if (JSON.stringify(updated) !== JSON.stringify(prev)) {
        return updated
      }
      return prev
    })
  }, [])

  return {
    ...result,
    updateParams,
    currentParams,
  }
}

// User profile hook
export function useUserProfile(userId: string | null) {
  const cacheKey = userId ? `user-profile:${userId}` : undefined

  return useAPICall(
    () => (userId ? getUserProfile(userId) : Promise.reject(new Error("No user ID provided"))),
    [userId],
    {
      cacheKey,
      ttl: 5 * 60 * 1000, // 5 minutes for user profiles
      enabled: !!userId,
    },
  )
}

// CTF-specific profile hook
export function useCTFProfile(ctfId: string | null, userId: string | null) {
  const cacheKey = ctfId && userId ? `ctf-profile:${ctfId}:${userId}` : undefined

  return useAPICall(
    () =>
      ctfId && userId ? getCTFProfile(ctfId, userId) : Promise.reject(new Error("CTF ID and User ID are required")),
    [ctfId, userId],
    {
      cacheKey,
      ttl: 3 * 60 * 1000, // 3 minutes for CTF profiles
      enabled: !!(ctfId && userId),
    },
  )
}

export function useCTFProfileDetailed(userId: string | null, ctfId: string | null, enabled = true) {
  const cacheKey = userId && ctfId ? `ctf-profile-detailed:${userId}:${ctfId}` : undefined

  return useAPICall(
    () => {
      if (!userId || !ctfId) {
        return Promise.reject(new Error("User ID and CTF ID are required"))
      }

      // Use the same API base URL logic as the rest of the app (NEXT_PUBLIC_API_BASE_URL).
      return getCTFProfile(ctfId, userId)
    },
    [userId, ctfId, enabled],
    {
      cacheKey,
      ttl: 3 * 60 * 1000, // 3 minutes
      enabled: enabled && !!(userId && ctfId),
    },
  )
}

// CTFs list hook
export function useCTFs(params: CTFsParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `ctfs:${paramsKey}`

  const result = useAPICall(() => getCTFs(currentParams), [paramsKey], {
    cacheKey,
    ttl: 10 * 60 * 1000, // 10 minutes for CTF list
    staleWhileRevalidate: true,
  })

  const updateParams = useCallback((newParams: Partial<CTFsParams>) => {
    setCurrentParams((prev) => ({ ...prev, ...newParams }))
  }, [])

  return {
    ...result,
    updateParams,
    currentParams,
  }
}

// CTF details hook
export function useCTFDetails(ctfId: string | null) {
  const cacheKey = ctfId ? `ctf-details:${ctfId}` : undefined

  return useAPICall(() => (ctfId ? getCTFDetails(ctfId) : Promise.reject(new Error("No CTF ID provided"))), [ctfId], {
    cacheKey,
    ttl: 15 * 60 * 1000, // 15 minutes for CTF details
    enabled: !!ctfId,
  })
}

// Cache status hook
export function useCacheStatus() {
  return useAPICall(() => getCacheStatus())
}

// Health check hook
export function useHealth() {
  return useAPICall(() => getHealth())
}

// Cache management hook
export function useCacheManagement() {
  const [clearing, setClearing] = useState(false)
  const [warming, setWarming] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [warmError, setWarmError] = useState<string | null>(null)

  const clearCache = useCallback(async () => {
    setClearing(true)
    setClearError(null)

    try {
      await clearCacheAction()
      // Also clear local cache
      dataCache.invalidate()
    } catch (error) {
      setClearError(error instanceof Error ? error.message : "Failed to clear cache")
    } finally {
      setClearing(false)
    }
  }, [])

  const warmCache = useCallback(async () => {
    setWarming(true)
    setWarmError(null)

    try {
      await warmCacheAction()
    } catch (error) {
      setWarmError(error instanceof Error ? error.message : "Failed to warm cache")
    } finally {
      setWarming(false)
    }
  }, [])

  const getCacheStats = useCallback(() => {
    return dataCache.getStats()
  }, [])

  const invalidatePattern = useCallback((pattern: string) => {
    dataCache.invalidate(pattern)
  }, [])

  return {
    clearCache,
    warmCache,
    clearing,
    warming,
    clearError,
    warmError,
    getCacheStats,
    invalidatePattern,
  }
}

// Polling hook for real-time updates
export function usePolling<T>(
  apiCall: () => Promise<T>,
  interval = 30000, // 30 seconds default
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await apiCall()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  useEffect(() => {
    if (!enabled) return

    fetchData() // Initial fetch

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData() // Refresh when tab becomes visible
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData()
      }
    }, interval)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [fetchData, interval, enabled])

  return { data, loading, error, refetch: fetchData }
}

// CTF rankings hook
export function useCTFRankings(params: any = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `ctf-rankings:${paramsKey}`

  const result = useAPICall(() => getCTFRankings(currentParams), [paramsKey], {
    cacheKey,
    ttl: 3 * 60 * 1000, // 3 minutes for rankings
    staleWhileRevalidate: true,
  })

  const updateParams = useCallback((newParams: Partial<any>) => {
    setCurrentParams((prev: any) => ({ ...prev, ...newParams }))
  }, [])

  return {
    ...result,
    updateParams,
    currentParams,
  }
}

// Certificates hook
export function useCertificates(userId: string | null) {
  const cacheKey = userId ? `certificates:${userId}` : undefined

  return useAPICall(
    () => {
      if (!userId) throw new Error("User ID is required")
      return getCertificates(userId)
    },
    [userId],
    {
      cacheKey,
      ttl: 10 * 60 * 1000, // 10 minutes for certificates
      enabled: !!userId,
    }
  )
}

// Single certificate hook
export function useCertificate(userId: string | null, period: string | null) {
  const cacheKey = userId && period ? `certificate:${userId}:${period}` : undefined

  return useAPICall(
    () => {
      if (!userId || !period) throw new Error("User ID and period are required")
      return getCertificate(userId, period)
    },
    [userId, period],
    {
      cacheKey,
      ttl: 10 * 60 * 1000, // 10 minutes for certificates
      enabled: !!userId && !!period,
    }
  )
}

// Comprehensive caching system with TTL and request deduplication
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>()
  private pendingRequests = new Map<string, Promise<any>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl: number = 5 * 60 * 1000): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!
    }

    // Make new request
    const promise = fetcher()
      .then((data) => {
        this.set(key, data, ttl)
        this.pendingRequests.delete(key)
        return data
      })
      .catch((error) => {
        this.pendingRequests.delete(key)
        throw error
      })

    this.pendingRequests.set(key, promise)
    return promise
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      this.pendingRequests.clear()
      return
    }

    // Invalidate keys matching pattern
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
      })),
    }
  }
}

// Global cache instance
const dataCache = new DataCache()

export default {
  useScoreboard,
  useUserProfile,
  useCTFProfile,
  useCTFProfileDetailed,
  useCTFs,
  useCTFDetails,
  useCacheStatus,
  useHealth,
  useCacheManagement,
  usePolling,
  useCTFRankings,
}
