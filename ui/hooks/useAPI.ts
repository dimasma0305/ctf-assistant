"use client"

import { useState, useEffect, useCallback } from "react"
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
} from "@/lib/actions"
import type { ScoreboardParams, CTFsParams } from "@/lib/types"

// Generic API hook
function useAPICall<T>(apiCall: () => Promise<T>, dependencies: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchData = useCallback(
    async (isRetry = false) => {
      if (!isRetry) {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await apiCall()
        setData(result)
        setRetryCount(0) // Reset retry count on success
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An error occurred"
        setError(errorMessage)

        if (retryCount < 2 && (errorMessage.includes("fetch") || errorMessage.includes("network"))) {
          setTimeout(
            () => {
              setRetryCount((prev) => prev + 1)
              fetchData(true)
            },
            1000 * (retryCount + 1),
          ) // Exponential backoff
        }
      } finally {
        setLoading(false)
      }
    },
    [...dependencies, retryCount],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData, retryCount }
}

// Scoreboard hook
export function useScoreboard(initialParams: ScoreboardParams = {}) {
  const [currentParams, setCurrentParams] = useState(initialParams)

  // Use JSON.stringify to create a stable dependency for the API call
  const paramsKey = JSON.stringify(currentParams)

  const result = useAPICall(
    () => getScoreboard(currentParams),
    [paramsKey], // Use stringified params to avoid object reference issues
  )

  const updateParams = useCallback((newParams: Partial<ScoreboardParams>) => {
    setCurrentParams((prev) => {
      const updated = { ...prev, ...newParams }
      // Only update if params actually changed
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
  return useAPICall(
    () => (userId ? getUserProfile(userId) : Promise.reject(new Error("No user ID provided"))),
    [userId],
  )
}

// CTF-specific profile hook
export function useCTFProfile(ctfId: string | null, userId: string | null) {
  return useAPICall(
    () =>
      ctfId && userId ? getCTFProfile(ctfId, userId) : Promise.reject(new Error("CTF ID and User ID are required")),
    [ctfId, userId],
  )
}

// CTFs list hook
export function useCTFs(params: CTFsParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)

  const result = useAPICall(() => getCTFs(currentParams), [currentParams])

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
  return useAPICall(() => (ctfId ? getCTFDetails(ctfId) : Promise.reject(new Error("No CTF ID provided"))), [ctfId])
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

  return {
    clearCache,
    warmCache,
    clearing,
    warming,
    clearError,
    warmError,
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

export function useCTFRankings(params: any = {}) {
  const [currentParams, setCurrentParams] = useState(params)

  const result = useAPICall(() => getCTFRankings(currentParams), [currentParams])

  const updateParams = useCallback((newParams: Partial<any>) => {
    setCurrentParams((prev: any) => ({ ...prev, ...newParams }))
  }, [])

  return {
    ...result,
    updateParams,
    currentParams,
  }
}

export default {
  useScoreboard,
  useUserProfile,
  useCTFProfile,
  useCTFs,
  useCTFDetails,
  useCacheStatus,
  useHealth,
  useCacheManagement,
  usePolling,
  useCTFRankings,
}
