'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Memory cache for storing image URLs and their blob URLs
const imageMemoryCache = new Map<string, string>()

// Cache name for browser Cache API
const CACHE_NAME = 'ctf-assistant-images-v1'

interface UseImageCacheResult {
  /** The cached image URL (blob URL or original URL) */
  imageUrl: string | null
  /** Whether the image is currently loading */
  loading: boolean
  /** Any error that occurred while loading */
  error: string | null
  /** Function to manually invalidate cache for this URL */
  invalidateCache: () => Promise<void>
  /** Function to preload an image into cache */
  preload: (url: string) => Promise<void>
}

interface UseImageCacheOptions {
  /** Whether to use persistent cache (Cache API) */
  persistent?: boolean
  /** Cache expiry time in milliseconds (default: 24 hours) */
  maxAge?: number
  /** Whether to return original URL as fallback on cache miss */
  fallbackToOriginal?: boolean
}

/**
 * Custom hook for caching images by URL
 * Provides both memory and persistent caching for better performance
 */
export function useImageCache(
  originalUrl: string | null | undefined,
  options: UseImageCacheOptions = {}
): UseImageCacheResult {
  const {
    persistent = true,
    maxAge = 24 * 60 * 60 * 1000, // 24 hours
    fallbackToOriginal = true
  } = options

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Helper function to check if cache is supported
  const isCacheSupported = useCallback(() => {
    return typeof window !== 'undefined' && 'caches' in window
  }, [])

  // Helper function to generate cache key
  const getCacheKey = useCallback((url: string) => {
    return `image-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
  }, [])

  // Helper function to check if cached item is expired
  const isCacheExpired = useCallback((timestamp: number) => {
    return Date.now() - timestamp > maxAge
  }, [maxAge])

  // Function to load image from network and cache it
  const loadAndCacheImage = useCallback(async (url: string, signal?: AbortSignal): Promise<string> => {
    try {
      const response = await fetch(url, { signal })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`)
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      // Store in memory cache
      imageMemoryCache.set(url, blobUrl)

      // Store in persistent cache if supported
      if (persistent && isCacheSupported()) {
        try {
          const cache = await caches.open(CACHE_NAME)
          const cacheResponse = new Response(blob, {
            headers: {
              'content-type': blob.type,
              'x-cached-at': Date.now().toString()
            }
          })
          await cache.put(url, cacheResponse)
        } catch (cacheError) {
          console.warn('Failed to store image in persistent cache:', cacheError)
        }
      }

      return blobUrl
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      throw new Error(`Failed to load image: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [persistent, isCacheSupported])

  // Function to load image from persistent cache
  const loadFromPersistentCache = useCallback(async (url: string): Promise<string | null> => {
    if (!persistent || !isCacheSupported()) {
      return null
    }

    try {
      const cache = await caches.open(CACHE_NAME)
      const cachedResponse = await cache.match(url)

      if (cachedResponse) {
        const cachedAt = cachedResponse.headers.get('x-cached-at')
        
        // Check if cache is expired
        if (cachedAt && isCacheExpired(parseInt(cachedAt))) {
          await cache.delete(url)
          return null
        }

        const blob = await cachedResponse.blob()
        const blobUrl = URL.createObjectURL(blob)

        // Also store in memory cache for faster future access
        imageMemoryCache.set(url, blobUrl)

        return blobUrl
      }
    } catch (err) {
      console.warn('Failed to load image from persistent cache:', err)
    }

    return null
  }, [persistent, isCacheSupported, isCacheExpired])

  // Function to load image with caching
  const loadImage = useCallback(async (url: string) => {
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setLoading(true)
    setError(null)

    try {
      // Check memory cache first
      const memoryCachedUrl = imageMemoryCache.get(url)
      if (memoryCachedUrl) {
        setImageUrl(memoryCachedUrl)
        setLoading(false)
        return memoryCachedUrl
      }

      // Check persistent cache
      const persistentCachedUrl = await loadFromPersistentCache(url)
      if (persistentCachedUrl) {
        setImageUrl(persistentCachedUrl)
        setLoading(false)
        return persistentCachedUrl
      }

      // Load from network and cache
      const networkUrl = await loadAndCacheImage(url, signal)
      setImageUrl(networkUrl)
      setLoading(false)
      return networkUrl
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return // Request was cancelled
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to load image'
      setError(errorMessage)
      setLoading(false)

      // Fallback to original URL if requested
      if (fallbackToOriginal) {
        setImageUrl(url)
        return url
      }

      throw err
    }
  }, [loadAndCacheImage, loadFromPersistentCache, fallbackToOriginal])

  // Function to invalidate cache for the current URL
  const invalidateCache = useCallback(async () => {
    if (!originalUrl) return

    // Remove from memory cache
    const cachedBlobUrl = imageMemoryCache.get(originalUrl)
    if (cachedBlobUrl) {
      URL.revokeObjectURL(cachedBlobUrl)
      imageMemoryCache.delete(originalUrl)
    }

    // Remove from persistent cache
    if (persistent && isCacheSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME)
        await cache.delete(originalUrl)
      } catch (err) {
        console.warn('Failed to invalidate persistent cache:', err)
      }
    }

    // Reset state
    setImageUrl(null)
    setError(null)
  }, [originalUrl, persistent, isCacheSupported])

  // Function to preload an image
  const preload = useCallback(async (url: string) => {
    try {
      await loadImage(url)
    } catch (err) {
      console.warn('Failed to preload image:', url, err)
    }
  }, [loadImage])

  // Effect to load image when URL changes
  useEffect(() => {
    if (!originalUrl) {
      setImageUrl(null)
      setLoading(false)
      setError(null)
      return
    }

    loadImage(originalUrl).catch(() => {
      // Error handling is done in loadImage
    })

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [originalUrl, loadImage])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    imageUrl,
    loading,
    error,
    invalidateCache,
    preload
  }
}

// Utility function to clear entire image cache
export async function clearImageCache() {
  // Clear memory cache
  imageMemoryCache.forEach((blobUrl) => {
    URL.revokeObjectURL(blobUrl)
  })
  imageMemoryCache.clear()

  // Clear persistent cache
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      await caches.delete(CACHE_NAME)
    } catch (err) {
      console.warn('Failed to clear persistent cache:', err)
    }
  }
}

// Utility function to get cache stats
export function getImageCacheStats() {
  return {
    memoryCacheSize: imageMemoryCache.size,
    memoryCacheKeys: Array.from(imageMemoryCache.keys())
  }
}
