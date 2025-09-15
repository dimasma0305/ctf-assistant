'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'
import { useImageCache } from '@/hooks/useImageCache'

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'bg-muted flex size-full items-center justify-center rounded-full',
        className,
      )}
      {...props}
    />
  )
}

interface CachedAvatarImageProps extends Omit<React.ComponentProps<typeof AvatarPrimitive.Image>, 'src'> {
  src: string | null | undefined
  /** Whether to show loading state */
  showLoading?: boolean
  /** Loading placeholder content */
  loadingPlaceholder?: React.ReactNode
  /** Whether to use persistent caching */
  persistent?: boolean
  /** Cache expiry time in milliseconds */
  maxAge?: number
}

/**
 * Avatar image component with built-in caching
 * Automatically caches images for better performance and offline support
 */
function CachedAvatarImage({
  className,
  src,
  showLoading = true,
  loadingPlaceholder,
  persistent = true,
  maxAge,
  ...props
}: CachedAvatarImageProps) {
  const { imageUrl, loading, error } = useImageCache(src, { 
    persistent, 
    maxAge,
    fallbackToOriginal: true 
  })

  // Show loading state if requested
  if (showLoading && loading && loadingPlaceholder) {
    return (
      <div 
        data-slot="avatar-image-loading"
        className={cn('aspect-square size-full flex items-center justify-center', className)}
      >
        {loadingPlaceholder}
      </div>
    )
  }

  // If we have an error and no cached image, let AvatarFallback handle it
  if (error && !imageUrl) {
    return null
  }

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      src={imageUrl || undefined}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, CachedAvatarImage }
