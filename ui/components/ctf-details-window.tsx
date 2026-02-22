import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Window, useWindow } from "@/components/ui/window"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trophy, ExternalLink, AlertCircle } from "lucide-react"
import { useCTFDetails } from "@/hooks/useAPI"
import type { CTFResponse } from "@/lib/types"

function CTFDetailsWindowComponent({
    windowId,
    ctfId,
    ctf,
    onClose,
}: {
    windowId: string
    ctfId: string
    ctf: CTFResponse
    onClose: () => void
}) {
    const { data: ctfDetails, loading: detailLoading, error: detailError } = useCTFDetails(ctfId)
    const { windows } = useWindow()

    return (
        <Window
            id={windowId}
            title={ctf ? `${ctf.title} - Details` : "CTF Details"}
            defaultSize={{ width: 1000, height: 700 }}
            minSize={{ width: 320, height: 400 }}
            onOpenChange={(open) => {
                if (!open) {
                    // If the window still exists in the provider, it's minimized, not closed.
                    if (windows.some((w) => w.id === windowId)) return
                    onClose()
                }
            }}
        >
            <div className="flex flex-col h-full">
                {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="ml-3 text-muted-foreground">Loading CTF details...</p>
                    </div>
                ) : detailError ? (
                    <div className="p-8 text-center">
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>Failed to load CTF details: {detailError}</AlertDescription>
                        </Alert>
                    </div>
                ) : (
                    ctfDetails && (
                        <>
                            {/* Header */}
                            <div className="p-4 sm:p-6 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    {/* Left side - CTF info */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <Avatar className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 ring-4 ring-primary/30 shadow-lg">
                                            <CachedAvatarImage
                                                src={ctfDetails.logo || "/placeholder.svg"}
                                                loadingPlaceholder={
                                                    <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                                }
                                            />
                                            <AvatarFallback className="bg-primary/20 text-foreground text-lg sm:text-xl">
                                                {ctfDetails.title.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-xl sm:text-2xl font-bold text-primary font-[family-name:var(--font-outfit)] mb-2 line-clamp-2">
                                                {ctfDetails.title}
                                            </h2>
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className="text-sm text-muted-foreground">
                                                    {ctfDetails.organizer} • {ctfDetails.format}
                                                </span>
                                                <Badge variant="secondary" className="text-foreground bg-primary/10 border-primary/20 text-xs">
                                                    Weight: {ctfDetails.weight}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right side - Quick stats and action */}
                                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 w-full sm:w-auto">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center gap-2 hover:bg-primary/10 border-primary/20 bg-transparent text-xs sm:text-sm"
                                            onClick={() => {
                                                window.open(ctfDetails.url, "_blank")
                                            }}
                                        >
                                            <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                                            <span className="hidden sm:inline">Visit CTF Website</span>
                                            <span className="sm:hidden">Website</span>
                                        </Button>
                                        <div className="text-right text-sm">
                                            <div className="font-bold text-xl sm:text-2xl text-primary">
                                                {ctfDetails.communityStats.uniqueParticipants}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Participants</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                                <div className="space-y-6">
                                    {ctfDetails.description && (
                                        <div>
                                            <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                                                Description
                                            </h4>
                                            <p className="text-muted-foreground text-sm bg-gradient-to-r from-muted/50 to-transparent p-4 border border-primary/10">
                                                {ctfDetails.description}
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                                            Community Participation
                                        </h4>
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                            <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border border-chart-3/20">
                                                <CardContent className="p-3 sm:p-4 text-center">
                                                    <div className="text-xl sm:text-2xl font-bold text-chart-3 mb-1">
                                                        {ctfDetails.communityStats.uniqueParticipants}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Participants</div>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border border-chart-2/20">
                                                <CardContent className="p-3 sm:p-4 text-center">
                                                    <div className="text-xl sm:text-2xl font-bold text-chart-2 mb-1">
                                                        {ctfDetails.communityStats.totalSolves}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Total Solves</div>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border border-chart-4/20">
                                                <CardContent className="p-3 sm:p-4 text-center">
                                                    <div className="text-xl sm:text-2xl font-bold text-chart-4 mb-1">
                                                        {ctfDetails.communityStats.challengesSolved}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Challenges</div>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-gradient-to-br from-chart-1/10 to-chart-1/5 border border-chart-1/20">
                                                <CardContent className="p-3 sm:p-4 text-center">
                                                    <div className="text-xl sm:text-2xl font-bold text-chart-1 mb-1">
                                                        {ctfDetails.communityStats.categoriesCovered}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">Categories</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                                            <Badge className="w-4 h-4 sm:w-5 sm:h-5" />
                                            Categories
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {ctfDetails.communityStats.categories.map((category) => (
                                                <Badge
                                                    key={category}
                                                    variant="secondary"
                                                    className="text-foreground bg-primary/10 border-primary/20"
                                                >
                                                    {category}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold mb-3 text-primary flex items-center gap-2 text-sm sm:text-base">
                                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                                            Top Performers
                                        </h4>
                                        <div className="space-y-3">
                                            {ctfDetails.leaderboard.map((player) => (
                                                <Card key={player.user.userId} className="p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                            <div className="flex items-center justify-center w-8 h-8 bg-primary/20 text-primary font-bold text-sm flex-shrink-0">
                                                                #{player.rank}
                                                            </div>
                                                            <span className="font-medium truncate text-foreground">
                                                                {player.user.displayName || player.user.username}
                                                            </span>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <div className="font-semibold text-primary">{player.score.toFixed(1)}</div>
                                                            <div className="text-xs text-muted-foreground">{player.solves} solves</div>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                )}
            </div>
        </Window>
    )
}

export const CTFDetailsWindow = React.memo(CTFDetailsWindowComponent)
