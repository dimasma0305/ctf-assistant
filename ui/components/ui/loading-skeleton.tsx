import { cn } from "@/lib/utils"

interface LoadingSkeletonProps {
  className?: string
  variant?: "default" | "card" | "table" | "avatar" | "text"
  count?: number
}

export function LoadingSkeleton({ className, variant = "default", count = 1 }: LoadingSkeletonProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case "card":
        return "h-32 w-full rounded-lg"
      case "table":
        return "h-16 w-full rounded"
      case "avatar":
        return "h-10 w-10 rounded-full"
      case "text":
        return "h-4 w-3/4 rounded"
      default:
        return "h-8 w-full rounded"
    }
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("bg-muted animate-pulse", getVariantClasses(), className)} />
      ))}
    </>
  )
}
