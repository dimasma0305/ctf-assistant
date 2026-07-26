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
import type { ScoreboardParams, CTFsParams, CTFRankingsParams } from "@/lib/types"

// Global map to deduplicate concurrent requests for the same cacheKey
const inFlightRequests = new Map<string, Promise<unknown>>()

interface APICallOptions {
  cacheKey?: string
  ttl?: number
  enabled?: boolean
  staleWhileRevalidate?: boolean
}

const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, duration)
  })

// Generic API hook
function useAPICall<T>(
  apiCall: () => Promise<T>,
  options: APICallOptions = {},
) {
  const { cacheKey, ttl = 5 * 60 * 1000, enabled = true, staleWhileRevalidate = false } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isStale, setIsStale] = useState(false)
  const [lastFetch, setLastFetch] = useState(0)

  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!enabled) {
        setLoading(false)
        return
      }

      // Cancel previous request
      abortControllerRef.current?.abort()

      const controller = new AbortController()
      abortControllerRef.current = controller

      if (!forceRefresh) {
        setLoading(true)
        setIsStale(false)
      }
      setError(null)

      let shouldForceRefresh = forceRefresh

      if (cacheKey && !shouldForceRefresh) {
        const cached = dataCache.get<T>(cacheKey)
        if (cached !== null) {
          setData(cached)
          setLoading(false)

          if (!staleWhileRevalidate) {
            return
          }

          // Revalidate only after the cached value is at least halfway to its
          // TTL, while continuing to render the cached value.
          const age = dataCache.getAge(cacheKey) ?? Number.POSITIVE_INFINITY
          if (age <= ttl / 2) {
            return
          }

          setIsStale(true)
          shouldForceRefresh = true
        }
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          let result: T

          if (cacheKey && !shouldForceRefresh) {
            const existingRequest = inFlightRequests.get(cacheKey) as Promise<T> | undefined
            if (existingRequest) {
              result = await existingRequest
            } else {
              const fetchPromise = dataCache.getOrFetch(cacheKey, apiCall, ttl)
              inFlightRequests.set(cacheKey, fetchPromise)
              try {
                result = await fetchPromise
              } finally {
                inFlightRequests.delete(cacheKey)
              }
            }
          } else if (cacheKey) {
            const fetchPromise = apiCall()
            inFlightRequests.set(cacheKey, fetchPromise)
            try {
              result = await fetchPromise
              dataCache.set(cacheKey, result, ttl)
            } finally {
              inFlightRequests.delete(cacheKey)
            }
          } else {
            result = await apiCall()
          }

          if (!controller.signal.aborted) {
            setData(result)
            setRetryCount(0)
            setIsStale(false)
            setLastFetch(Date.now())
          }
          break
        } catch (err) {
          if (controller.signal.aborted) {
            return
          }

          const errorMessage = err instanceof Error ? err.message : "An error occurred"
          const isNetworkError = /fetch|network/i.test(errorMessage)
          const shouldRetry = isNetworkError && attempt < 2

          if (!shouldRetry) {
            setError(errorMessage)
            break
          }

          setRetryCount(attempt + 1)
          await wait(1000 * 2 ** attempt)
        }
      }

      if (!controller.signal.aborted) {
        setLoading(false)
      }
    },
    [apiCall, cacheKey, enabled, staleWhileRevalidate, ttl],
  )

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        void fetchData()
      }
    })

    return () => {
      active = false
      abortControllerRef.current?.abort()
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
    lastFetch,
  }
}

// Scoreboard hook
export function useScoreboard(initialParams: ScoreboardParams = {}) {
  const [currentParams, setCurrentParams] = useState(initialParams)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `scoreboard:${paramsKey}`
  const apiCall = useCallback(() => getScoreboard(currentParams), [currentParams])

  const result = useAPICall(apiCall, {
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
  const apiCall = useCallback(
    () => (userId ? getUserProfile(userId) : Promise.reject(new Error("No user ID provided"))),
    [userId],
  )

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 5 * 60 * 1000, // 5 minutes for user profiles
    enabled: !!userId,
  })
}

// CTF-specific profile hook
export function useCTFProfile(ctfId: string | null, userId: string | null) {
  const cacheKey = ctfId && userId ? `ctf-profile:${ctfId}:${userId}` : undefined
  const apiCall = useCallback(
    () =>
      ctfId && userId ? getCTFProfile(ctfId, userId) : Promise.reject(new Error("CTF ID and User ID are required")),
    [ctfId, userId],
  )

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 3 * 60 * 1000, // 3 minutes for CTF profiles
    enabled: !!(ctfId && userId),
  })
}

export function useCTFProfileDetailed(userId: string | null, ctfId: string | null, enabled = true) {
  const cacheKey = userId && ctfId ? `ctf-profile-detailed:${userId}:${ctfId}` : undefined
  const apiCall = useCallback(() => {
      if (!userId || !ctfId) {
        return Promise.reject(new Error("User ID and CTF ID are required"))
      }

      // Use the same API base URL logic as the rest of the app (NEXT_PUBLIC_API_BASE_URL).
      return getCTFProfile(ctfId, userId)
    }, [userId, ctfId])

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 3 * 60 * 1000, // 3 minutes
    enabled: enabled && !!(userId && ctfId),
  })
}

// CTFs list hook
export function useCTFs(params: CTFsParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `ctfs:${paramsKey}`
  const apiCall = useCallback(() => getCTFs(currentParams), [currentParams])

  const result = useAPICall(apiCall, {
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
  const apiCall = useCallback(
    () => (ctfId ? getCTFDetails(ctfId) : Promise.reject(new Error("No CTF ID provided"))),
    [ctfId],
  )

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 15 * 60 * 1000, // 15 minutes for CTF details
    enabled: !!ctfId,
  })
}

// Cache status hook
export function useCacheStatus() {
  const apiCall = useCallback(() => getCacheStatus(), [])
  return useAPICall(apiCall)
}

// Health check hook
export function useHealth() {
  const apiCall = useCallback(() => getHealth(), [])
  return useAPICall(apiCall)
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

    let active = true
    queueMicrotask(() => {
      if (active) {
        void fetchData()
      }
    })

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
      active = false
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [fetchData, interval, enabled])

  return { data, loading, error, refetch: fetchData }
}

// CTF rankings hook
export function useCTFRankings(params: CTFRankingsParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  const paramsKey = JSON.stringify(currentParams)
  const cacheKey = `ctf-rankings:${paramsKey}`
  const apiCall = useCallback(() => getCTFRankings(currentParams), [currentParams])

  const result = useAPICall(apiCall, {
    cacheKey,
    ttl: 3 * 60 * 1000, // 3 minutes for rankings
    staleWhileRevalidate: true,
  })

  const updateParams = useCallback((newParams: Partial<CTFRankingsParams>) => {
    setCurrentParams((prev) => ({ ...prev, ...newParams }))
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
  const apiCall = useCallback(() => {
    if (!userId) throw new Error("User ID is required")
    return getCertificates(userId)
  }, [userId])

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 10 * 60 * 1000, // 10 minutes for certificates
    enabled: !!userId,
  })
}

// Single certificate hook
export function useCertificate(userId: string | null, period: string | null) {
  const cacheKey = userId && period ? `certificate:${userId}:${period}` : undefined
  const apiCall = useCallback(() => {
    if (!userId || !period) throw new Error("User ID and period are required")
    return getCertificate(userId, period)
  }, [userId, period])

  return useAPICall(apiCall, {
    cacheKey,
    ttl: 10 * 60 * 1000, // 10 minutes for certificates
    enabled: !!userId && !!period,
  })
}

// Comprehensive caching system with TTL and request deduplication
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class DataCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private pendingRequests = new Map<string, Promise<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  /** Age of a cached entry in ms, or null if it isn't cached. */
  getAge(key: string): number | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    return Date.now() - entry.timestamp
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl: number = 5 * 60 * 1000): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key) as Promise<T>
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

const apiHooks = {
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

export default apiHooks
