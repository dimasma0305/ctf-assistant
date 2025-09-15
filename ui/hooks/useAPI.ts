import { useState, useEffect, useCallback } from 'react'
import { APIClient } from '@/lib/api'
import {
  ScoreboardResponse,
  UserProfileResponse,
  CTFProfileResponse,
  CTFsResponse,
  CTFDetailsResponse,
  ScoreboardParams,
  CTFsParams,
} from '@/lib/types'

// Generic API hook
function useAPICall<T>(
  apiCall: () => Promise<T>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await apiCall()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, dependencies)

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

// Scoreboard hook
export function useScoreboard(params: ScoreboardParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  
  const result = useAPICall(
    () => APIClient.getLeaderboard(currentParams),
    [currentParams]
  )

  const updateParams = useCallback((newParams: Partial<ScoreboardParams>) => {
    setCurrentParams(prev => ({ ...prev, ...newParams }))
  }, [])

  return {
    ...result,
    updateParams,
    currentParams
  }
}

// User profile hook
export function useUserProfile(userId: string | null) {
  return useAPICall(
    () => userId ? APIClient.getUserProfile(userId) : Promise.reject(new Error('No user ID provided')),
    [userId]
  )
}

// CTF-specific profile hook
export function useCTFProfile(ctfId: string | null, userId: string | null) {
  return useAPICall(
    () => ctfId && userId 
      ? APIClient.getCTFProfile(ctfId, userId) 
      : Promise.reject(new Error('CTF ID and User ID are required')),
    [ctfId, userId]
  )
}

// CTFs list hook
export function useCTFs(params: CTFsParams = {}) {
  const [currentParams, setCurrentParams] = useState(params)
  
  const result = useAPICall(
    () => APIClient.getCTFs(currentParams),
    [currentParams]
  )

  const updateParams = useCallback((newParams: Partial<CTFsParams>) => {
    setCurrentParams(prev => ({ ...prev, ...newParams }))
  }, [])

  return {
    ...result,
    updateParams,
    currentParams
  }
}

// CTF details hook
export function useCTFDetails(ctfId: string | null) {
  return useAPICall(
    () => ctfId ? APIClient.getCTFDetails(ctfId) : Promise.reject(new Error('No CTF ID provided')),
    [ctfId]
  )
}

// Cache status hook
export function useCacheStatus() {
  return useAPICall(() => APIClient.getCacheStatus())
}

// Health check hook
export function useHealth() {
  return useAPICall(() => APIClient.getHealth())
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
      await APIClient.clearCache()
    } catch (error) {
      setClearError(error instanceof Error ? error.message : 'Failed to clear cache')
    } finally {
      setClearing(false)
    }
  }, [])

  const warmCache = useCallback(async () => {
    setWarming(true)
    setWarmError(null)
    
    try {
      await APIClient.warmCache()
    } catch (error) {
      setWarmError(error instanceof Error ? error.message : 'Failed to warm cache')
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
    warmError
  }
}

// Polling hook for real-time updates
export function usePolling<T>(
  apiCall: () => Promise<T>,
  interval: number = 30000, // 30 seconds default
  enabled: boolean = true
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
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  useEffect(() => {
    if (!enabled) return

    fetchData() // Initial fetch
    
    const intervalId = setInterval(fetchData, interval)
    
    return () => clearInterval(intervalId)
  }, [fetchData, interval, enabled])

  return { data, loading, error, refetch: fetchData }
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
}
