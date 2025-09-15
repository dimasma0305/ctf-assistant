"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trophy, Medal, Award, Users, Target, Calendar } from "lucide-react"
import { APIClient } from "@/lib/api"
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
      
      const response = await APIClient.getCTFRankings({ 
        limit: 10, 
        hasParticipation: true 
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
      const profileData = await APIClient.getCTFProfile(ctfId, userId)
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
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">CTF-Specific Rankings</h3>
          <p className="text-sm text-muted-foreground">View leaderboards for individual competitions</p>
        </div>
        <Select value={selectedCTF} onValueChange={setSelectedCTF} disabled={ctfRankings.length === 0}>
          <SelectTrigger className="w-64">
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
          <Card key={ctf.ctf_id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <CachedAvatarImage src={ctf.logo || "/placeholder.svg"} alt={ctf.title} />
                    <AvatarFallback className="bg-primary/20 text-foreground">
                      {ctf.title.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="font-[family-name:var(--font-playfair)]">{ctf.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <span>by {ctf.organizer}</span>
                      <Badge className={`text-xs ${getStatusColor(ctf.schedule.status)}`}>{ctf.schedule.status}</Badge>
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {ctf.communityStats.uniqueParticipants} players
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {ctf.communityStats.totalSolves} solves
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(ctf.schedule.start)}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Solves</TableHead>
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
                          className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                          onClick={() => handleUserClick(ctf.ctf_id, player.user.userId)}
                        >
                          <Avatar className="w-8 h-8">
                            <CachedAvatarImage
                              src={player.user.avatar || `/abstract-geometric-shapes.png?height=32&width=32&query=${player.user.userId}`}
                            />
                            <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                              {(player.user.displayName || player.user.username).substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium hover:text-primary transition-colors">
                              {player.user.displayName || player.user.username}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {player.rank <= 3 ? "Elite" : player.rank <= 10 ? "Advanced" : "Intermediate"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono font-bold text-primary">{player.score.toFixed(1)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono text-foreground">
                          {player.solves}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          ))
        )}
      </div>

      {/* CTF-Specific User Profile Modal */}
      <Dialog open={showUserProfile} onOpenChange={setShowUserProfile}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <CachedAvatarImage
                        src={selectedUser.user.avatar || `/abstract-geometric-shapes.png?height=64&width=64&query=${selectedUser.user.userId}`}
                      />
                      <AvatarFallback className="bg-primary/20 text-foreground text-lg">
                        {(selectedUser.user.displayName || selectedUser.user.username).substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-2xl font-[family-name:var(--font-playfair)]">
                        {selectedUser.user.displayName || selectedUser.user.username}
                      </DialogTitle>
                      <DialogDescription className="text-base flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        Rank #{selectedUser.ctfRank} of {selectedUser.totalParticipants} in {selectedUser.ctfInfo.title}
                        <Badge variant="secondary" className="ml-2 text-foreground">
                          Top {selectedUser.percentile}%
                        </Badge>
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6">
                  {/* CTF Stats */}
                  <div>
                    <h4 className="font-semibold mb-3">CTF Performance</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">{selectedUser.stats.score.toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">Total Score</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">{selectedUser.stats.solveCount}</div>
                          <div className="text-xs text-muted-foreground">Solves</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">{selectedUser.stats.categoriesCount}</div>
                          <div className="text-xs text-muted-foreground">Categories</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {selectedUser.stats.averagePointsPerSolve.toFixed(1)}
                          </div>
                          <div className="text-xs text-muted-foreground">Avg Points</div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div>
                    <h4 className="font-semibold mb-3">Category Performance</h4>
                    <div className="space-y-3">
                      {selectedUser.categoryBreakdown.map((category) => (
                        <div
                          key={category.name}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="capitalize">
                              {category.name}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{category.rankInCategory} of {category.totalInCategory}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-primary">{category.solves} solves</div>
                            <div className="text-xs text-muted-foreground">
                              {category.totalPoints} pts • Top {category.percentile}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Achievements */}
                  <div>
                    <h4 className="font-semibold mb-3">CTF Achievements</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedUser.achievements.map((achievement) => (
                        <Card key={achievement.name} className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">{achievement.icon}</div>
                            <div>
                              <div className="font-medium">{achievement.name}</div>
                              <div className="text-sm text-muted-foreground">{achievement.description}</div>
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
