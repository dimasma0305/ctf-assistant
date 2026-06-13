'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'

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
 * Avatar image backed by the native <img> loader (Radix Avatar.Image), which
 * goes straight through the browser's HTTP cache. Avatar URLs (Discord CDN) are
 * immutable and long-cached, so native loading is faster and caches better than
 * the old fetch()->blob()->objectURL hook: no per-avatar XHR waterfall, no CORS
 * requirement, no blob-URL leaks. While loading or on error, the sibling
 * <AvatarFallback> shows initials (Radix only reveals the image once it loads).
 *
 * The caching-related props are kept for call-site compatibility but are no-ops.
 */
function CachedAvatarImage({
  className,
  src,
  showLoading: _showLoading,
  loadingPlaceholder: _loadingPlaceholder,
  persistent: _persistent,
  maxAge: _maxAge,
  ...props
}: CachedAvatarImageProps) {
  if (!src) return null

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      src={src}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, CachedAvatarImage }
