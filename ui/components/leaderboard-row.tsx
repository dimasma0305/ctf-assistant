import React from "react"
import { TableRow, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { getRankIcon } from "@/lib/format-helpers"
import { ScoreDisplay } from "./score-display"

interface LeaderboardRowProps {
    entry: any // Replacing with 'any' since FormattedLeaderboardEntry isn't exported directly in types.ts. The original component relied on inferred types from mapping over data.
    onUserClick: (entry: any) => void
}

function LeaderboardRowComponent({ entry, onUserClick }: LeaderboardRowProps) {
    return (
        <TableRow
            className="hover:bg-primary/5 transition-colors border-b border-white/5 group"
        >
            <TableCell className="font-medium py-4">
                <div className="flex items-center justify-center filter drop-shadow-md">{getRankIcon(entry.rank)}</div>
            </TableCell>
            <TableCell className="py-4">
                <div
                    className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-2xl p-2 -m-2 transition-all duration-300 hover:scale-[1.02] border border-transparent hover:border-primary/20 hover:shadow-[0_4px_20px_-5px_var(--primary)]"
                    onClick={() => onUserClick(entry)}
                >
                    <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all shadow-[0_0_10px_-2px_var(--primary)]">
                        <CachedAvatarImage
                            src={
                                entry.user.avatar ||
                                `/abstract-geometric-shapes.png?height=48&width=48&query=user-${entry.user.userId}`
                            }
                            loadingPlaceholder={
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            }
                        />
                        <AvatarFallback className="text-sm bg-primary/20 text-primary font-bold">
                            {entry.userInitials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold hover:text-primary transition-colors truncate text-lg tracking-tight">
                            {entry.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap uppercase font-semibold tracking-wider">
                            <span className="whitespace-nowrap">{entry.skillLevel}</span>
                            <Badge variant="outline" className="text-[10px] border-primary/30 py-0 h-4">
                                Top {entry.percentile}%
                            </Badge>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-right py-4">
                <ScoreDisplay score={entry.totalScore} className="text-primary text-xl font-mono tracking-tighter font-black block" />
            </TableCell>
            <TableCell className="text-right py-4">
                <Badge variant="secondary" className="font-mono text-foreground font-black tracking-tight text-sm">
                    {entry.solveCount}
                </Badge>
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell py-4">
                <Badge variant="outline" className="font-mono font-bold tracking-tight">
                    {entry.ctfCount}
                </Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell py-4">
                <div className="flex flex-wrap gap-1">
                    {entry.categories.slice(0, 2).map((category: string) => (
                        <div key={category} className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs text-foreground uppercase tracking-widest px-2 py-0 border border-white/5">
                                {category}
                            </Badge>
                        </div>
                    ))}
                    {entry.categories.length > 2 && (
                        <Badge variant="secondary" className="text-xs text-foreground bg-white/5">
                            +{entry.categories.length - 2}
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell className="hidden lg:table-cell py-4">
                {entry.recentSolves.length > 0 ? (
                    <div className="text-sm">
                        <div className="font-medium truncate max-w-32">{entry.recentSolves[0].challenge}</div>
                        <div className="text-muted-foreground">{entry.recentSolves[0].points}</div>
                    </div>
                ) : (
                    <span className="text-muted-foreground text-sm">No recent activity</span>
                )}
            </TableCell>
        </TableRow>
    )
}

export const LeaderboardRow = React.memo(LeaderboardRowComponent)
