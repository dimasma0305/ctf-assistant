import { Trophy, Medal, Award } from "lucide-react"
import { createElement } from "react"

/**
 * Shared formatting and display helpers for CTF components.
 *
 * These were previously duplicated across ctf-rankings, ctf-list,
 * and leaderboard-table. Keep additions here so every view stays consistent.
 */

// ── Status Badges ───────────────────────────────────────────────────

export function getStatusColor(status: string): string {
    switch (status) {
        case "active":
            return "bg-green-500/20 text-green-400 border-green-500/30"
        case "upcoming":
            return "bg-blue-500/20 text-blue-400 border-blue-500/30"
        case "completed":
            return "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30"
        default:
            return "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30"
    }
}

// ── Date Formatting ─────────────────────────────────────────────────

export function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

export function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 24) {
        return `${diffInHours}h ago`
    }
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays}d ago`
}

// ── Rank Icons ──────────────────────────────────────────────────────

export function getRankIcon(rank: number) {
    switch (rank) {
        case 1:
            return createElement(Trophy, { className: "w-5 h-5 text-yellow-500" })
        case 2:
            return createElement(Medal, { className: "w-5 h-5 text-gray-400" })
        case 3:
            return createElement(Award, { className: "w-5 h-5 text-amber-600" })
        default:
            return createElement(
                "span",
                { className: "w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground" },
                `#${rank}`,
            )
    }
}

// ── User Display ────────────────────────────────────────────────────

export function getUserInitials(user: { displayName?: string | null; username: string }): string {
    const name = user.displayName || user.username
    const parts = name.split(" ")
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
}

export function getUserDisplayName(user: { displayName?: string | null; username: string }): string {
    return user.displayName || user.username
}
