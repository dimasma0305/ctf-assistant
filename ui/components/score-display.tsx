"use client"

import { cn } from "@/lib/utils"

interface ScoreDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
    score: number
    minimumFractionDigits?: number
    maximumFractionDigits?: number
}

/**
 * Unified component for displaying scores with consistent formatting.
 * Defaults to 2 decimal places (e.g. 100.50, 100.00).
 */
export function ScoreDisplay({
    score,
    className,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    ...props
}: ScoreDisplayProps) {
    const formattedScore = score.toLocaleString("en-US", {
        minimumFractionDigits,
        maximumFractionDigits,
    })

    return (
        <span className={cn("font-mono font-bold", className)} {...props}>
            {formattedScore}
        </span>
    )
}

/**
 * Helper function to format score string consistently if component cannot be used
 */
export function formatScore(
    score: number,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
): string {
    return score.toLocaleString("en-US", {
        minimumFractionDigits,
        maximumFractionDigits,
    })
}
