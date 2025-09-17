"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, Medal, Award, Users, Target, Calendar, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCTFRankings, getCTFProfile } from "@/lib/actions"
import { getAchievements } from "@/lib/utils"
import type { CTFRanking, CTFProfileResponse } from "@/lib/types"

export function CTFRankings() {
  const [ctfRankings, setCTFRankings] = useState<CTFRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCTF, setSelectedCTF] = useState<string>("all")
  const [selectedUser, setSelectedUser] = useState<CTFProfileResponse | null>(null)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Fetch CTF rankings from API
  const fetchCTFRankings = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await getCTFRankings({
        limit: 10,
        hasParticipation: true,
      })

      setCTFRankings(response.data || [])
    } catch (err) {
      console.error("Error fetching CTF rankings:", err)
      setError(err instanceof Error ? err.message : "Failed to load CTF rankings")
      setCTFRankings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCTFRankings()
  }, [])

  const handleUserClick = async (ctfId: string, userId: string) => {
    setProfileLoading(true)
    setShowUserProfile(true)
    setProfileError(null)
    setSelectedUser(null)

    try {
      const profileData = await getCTFProfile(ctfId, userId)
      setSelectedUser(profileData)
    } catch (err) {
      console.error("Error fetching user profile:", err)
      setProfileError(err instanceof Error ? err.message : "Failed to load user profile")
    } finally {
      setProfileLoading(false)
    }
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />
      default:
        return (
          <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">
            #{rank}
          </span>
        )
    }
  }

  const getStatusColor = (status: string) => {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const filteredRankings = selectedCTF === "all" ? ctfRankings : ctfRankings.filter((ctf) => ctf.ctf_id === selectedCTF)

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
              <div className="space-y-2">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="h-12 bg-muted rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-lg font-semibold">Failed to load CTF rankings</div>
          <div className="text-muted-foreground">{error}</div>
          <button
            onClick={fetchCTFRankings}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* CTF Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">CTF-Specific Rankings</h3>
          <p className="text-sm text-muted-foreground">View leaderboards for individual competitions</p>
        </div>
        <Select value={selectedCTF} onValueChange={setSelectedCTF} disabled={ctfRankings.length === 0}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select CTF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CTFs</SelectItem>
            {ctfRankings.map((ctf) => (
              <SelectItem key={ctf.ctf_id} value={ctf.ctf_id}>
                {ctf.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* CTF Rankings */}
      <div className="space-y-6">
        {filteredRankings.length === 0 ? (
          <Card className="p-6">
            <div className="text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No CTF rankings available</p>
              <p>No CTF competitions with community participation found.</p>
            </div>
          </Card>
        ) : (
          filteredRankings.map((ctf) => (
            <Card
              key={ctf.ctf_id}
              className="shadow-lg border-2 border-primary/10 hover:border-primary/20 transition-all duration-200"
            >
              <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-primary/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-primary/30 shadow-md">
                      <CachedAvatarImage
                        src={ctf.logo || "/placeholder.svg"}
                        loadingPlaceholder={
                          <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        }
                      />
                      <AvatarFallback className="bg-primary/20 text-foreground">
                        {ctf.title.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="font-bold text-primary font-[family-name:var(--font-playfair)] truncate">
                        {ctf.title}
                      </CardTitle>
                      <CardDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span>by {ctf.organizer}</span>
                        <Badge className={`text-xs ${getStatusColor(ctf.schedule.status)} w-fit`}>
                          {ctf.schedule.status}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span className="whitespace-nowrap">{ctf.communityStats.uniqueParticipants} players</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4" />
                        <span className="whitespace-nowrap">{ctf.communityStats.totalSolves} solves</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span className="whitespace-nowrap">{formatDate(ctf.schedule.start)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead className="min-w-[150px]">Player</TableHead>
                        <TableHead className="text-right min-w-[80px]">Score</TableHead>
                        <TableHead className="text-right min-w-[70px]">Solves</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctf.leaderboard.map((player) => (
                        <TableRow key={player.user.userId} className="hover:bg-muted/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center justify-center">{getRankIcon(player.rank)}</div>
                          </TableCell>
                          <TableCell>
                            <div
                              className="flex items-center gap-3 cursor-pointer hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent rounded-md p-2 -m-2 transition-all duration-200 border border-transparent hover:border-primary/20"
                              onClick={() => handleUserClick(ctf.ctf_id, player.user.userId)}
                            >
                              <Avatar className="w-8 h-8 flex-shrink-0 ring-1 ring-primary/20">
                                <CachedAvatarImage
                                  src={
                                    player.user.avatar ||
                                    `/abstract-geometric-shapes.png?height=32&width=32&query=${player.user.userId}`
                                  }
                                  loadingPlaceholder={
                                    <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                  }
                                />
                                <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                                  {(player.user.displayName || player.user.username).substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium hover:text-primary transition-colors truncate">
                                  {player.user.displayName || player.user.username}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {player.rank <= 3 ? "Elite" : player.rank <= 10 ? "Advanced" : "Intermediate"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-mono font-bold text-primary text-sm sm:text-base">
                              {player.score.toFixed(1)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="secondary"
                              className="font-mono text-foreground text-xs bg-primary/10 border-primary/20"
                            >
                              {player.solves}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* CTF-Specific User Profile Modal */}
      <Dialog open={showUserProfile} onOpenChange={setShowUserProfile}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto mx-4 shadow-2xl border-2 border-primary/20">
          {profileLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading CTF profile...</p>
            </div>
          ) : profileError ? (
            <div className="p-8 text-center space-y-4">
              <div className="text-red-500 text-lg font-semibold">Failed to load profile</div>
              <div className="text-muted-foreground">{profileError}</div>
              <button
                onClick={() => setShowUserProfile(false)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            selectedUser && (
              <>
                <DialogHeader className="pb-6 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-start justify-between gap-6">
                    {/* Left side - User info */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <Avatar className="h-20 w-20 flex-shrink-0 ring-4 ring-primary/30 shadow-lg">
                        <CachedAvatarImage
                          src={
                            selectedUser.user.avatar ||
                            `/abstract-geometric-shapes.png?height=80&width=80&query=${selectedUser.user.userId}`
                          }
                          loadingPlaceholder={
                            <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                          }
                        />
                        <AvatarFallback className="bg-primary/20 text-foreground text-xl">
                          {(selectedUser.user.displayName || selectedUser.user.username).substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <DialogTitle className="text-2xl font-bold text-primary font-[family-name:var(--font-playfair)] mb-2">
                          {selectedUser.user.displayName || selectedUser.user.username}
                        </DialogTitle>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Trophy className="w-4 h-4 text-yellow-500" />
                            <span className="font-semibold">Rank #{selectedUser.ctfRank}</span>
                            <span className="text-muted-foreground">of {selectedUser.totalParticipants}</span>
                          </div>
                          <Badge variant="secondary" className="text-foreground bg-primary/10 border-primary/20">
                            Top {selectedUser.percentile}%
                          </Badge>
                        </div>
                        <DialogDescription className="text-sm text-muted-foreground">
                          Performance in {selectedUser.ctfInfo.title}
                        </DialogDescription>
                      </div>
                    </div>

                    {/* Right side - Quick stats and action */}
                    <div className="flex flex-col items-end gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 hover:bg-primary/10 border-primary/20 bg-transparent"
                        onClick={() => {
                          window.open(`/profile/${selectedUser.user.userId}`, "_blank")
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Full Profile
                      </Button>
                      <div className="text-right text-sm">
                        <div className="font-bold text-2xl text-primary">{selectedUser.stats.score.toFixed(1)}</div>
                        <div className="text-xs text-muted-foreground">Total Score</div>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6 p-1">
                  <div>
                    <h4 className="font-semibold mb-4 text-primary flex items-center gap-2">
                      <Trophy className="w-5 h-5" />
                      Performance Overview
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border border-chart-3/20">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-chart-3 mb-1">{selectedUser.stats.solveCount}</div>
                          <div className="text-xs text-muted-foreground">Challenges Solved</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border border-chart-2/20">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-chart-2 mb-1">
                            {selectedUser.stats.categoriesCount}
                          </div>
                          <div className="text-xs text-muted-foreground">Categories Mastered</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border border-chart-4/20">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-chart-4 mb-1">
                            {selectedUser.stats.averagePointsPerSolve.toFixed(0)}
                          </div>
                          <div className="text-xs text-muted-foreground">Avg Points/Solve</div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-4 text-primary flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Category Breakdown
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {selectedUser.categoryBreakdown.map((category) => (
                        <Card
                          key={category.name}
                          className="p-4 bg-gradient-to-r from-muted/30 to-muted/10 border border-primary/10 hover:border-primary/20 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="capitalize font-medium">
                                {category.name}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                #{category.rankInCategory}/{category.totalInCategory}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-primary">{category.solves}</div>
                              <div className="text-xs text-muted-foreground">
                                {category.totalScore}pts • Top {category.percentile}%
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-4 text-primary flex items-center gap-2">
                      <Award className="w-5 h-5" />
                      Achievements ({getAchievements(selectedUser.achievementIds).length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {getAchievements(selectedUser.achievementIds).map((achievement, index) => (
                        <Card
                          key={`${achievement.id || achievement.name}-${index}`}
                          className="p-3 border border-primary/10 hover:border-primary/20 transition-colors bg-gradient-to-br from-primary/5 to-transparent"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-xl flex-shrink-0">{achievement.icon}</div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm leading-tight">{achievement.name}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {achievement.description}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
