"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Trophy, Medal, Award, ChevronLeft, ChevronRight, Search, Filter, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { UserProfileCard } from "@/components/user-profile-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useScoreboard } from "@/hooks/useAPI"
import { LeaderboardEntry } from "@/lib/types"

export function LeaderboardTable() {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchInput, setSearchInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCtf, setSelectedCtf] = useState<string>("global")
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null)
  const [showUserProfile, setShowUserProfile] = useState(false)

  // Use the API hook
  const { data: leaderboardData, loading, error, updateParams, currentParams } = useScoreboard({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    global: selectedCtf === "global",
    ctf_id: selectedCtf !== "global" ? selectedCtf : undefined,
    search: searchTerm || undefined, // Add search parameter
  })

  // Update API params when page, size, or CTF selection changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    updateParams({
      offset: (page - 1) * pageSize,
      limit: pageSize,
      search: searchTerm || undefined
    })
  }

  // Debounce search input to avoid excessive API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchInput !== searchTerm) {
        setSearchTerm(searchInput)
        setCurrentPage(1) // Reset to first page when searching
        updateParams({
          offset: 0,
          limit: pageSize,
          search: searchInput || undefined
        })
      }
    }, 500) // 500ms debounce delay

    return () => clearTimeout(timeoutId)
  }, [searchInput, searchTerm, pageSize, updateParams])

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value)
  }

  const handleCtfChange = (ctfId: string) => {
    setSelectedCtf(ctfId)
    setCurrentPage(1) // Reset to first page
    updateParams({
      offset: 0,
      global: ctfId === "global",
      ctf_id: ctfId !== "global" ? ctfId : undefined
    })
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

  const getUserInitials = (user: LeaderboardEntry['user']) => {
    // Use display name for initials
    const name = user.displayName || user.username
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const getUserDisplayName = (user: LeaderboardEntry['user']) => {
    return user.displayName || user.username
  }

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  const totalPages = leaderboardData ? Math.ceil(leaderboardData.metadata.total / pageSize) : 0

  const handleUserClick = (user: LeaderboardEntry) => {
    setSelectedUser(user)
    setShowUserProfile(true)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load leaderboard data: {error}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            className="w-64"
          />
          {searchInput && searchInput !== searchTerm && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedCtf} onValueChange={handleCtfChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select CTF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global Rankings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Leaderboard Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Solves</TableHead>
                <TableHead className="text-right">CTFs</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Recent Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboardData && leaderboardData.data.length > 0 ? (
                leaderboardData.data.map((entry) => (
                <TableRow key={entry.user.userId} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center justify-center">{getRankIcon(entry.rank)}</div>
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                      onClick={() => handleUserClick(entry)}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={entry.user.avatar || `/abstract-geometric-shapes.png?height=32&width=32&query=${entry.user.userId}`} />
                        <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                          {getUserInitials(entry.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium hover:text-primary transition-colors">
                          {getUserDisplayName(entry.user)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {entry.rank <= 10 ? "Elite" : entry.rank <= 50 ? "Advanced" : "Intermediate"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-mono font-bold text-primary">{formatScore(entry.totalScore)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono text-foreground">
                      {entry.solveCount}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="font-mono">
                      {entry.ctfCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.categories.slice(0, 3).map((category) => (
                        <Badge key={category} variant="secondary" className="text-xs text-foreground">
                          {category}
                        </Badge>
                      ))}
                      {entry.categories.length > 3 && (
                        <Badge variant="secondary" className="text-xs text-foreground">
                          +{entry.categories.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.recentSolves.length > 0 ? (
                      <div className="text-sm">
                        <div className="font-medium truncate max-w-32">{entry.recentSolves[0].challenge}</div>
                        <div className="text-muted-foreground">{entry.recentSolves[0].points} pts</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">No recent activity</span>
                    )}
                  </TableCell>
                </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchTerm ? (
                        <>
                          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>No players found matching "{searchTerm}"</p>
                          <p className="text-sm mt-1">Try a different search term</p>
                        </>
                      ) : (
                        <p>No players found</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {searchTerm ? (
              <>
                Showing {leaderboardData?.data.length || 0} of {leaderboardData?.metadata.total || 0} players
                {(leaderboardData?.data.length || 0) > 0 && (
                  <span className="text-primary ml-1">
                    (filtered by "{searchTerm}")
                  </span>
                )}
              </>
            ) : (
              <>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, leaderboardData?.metadata.total || 0)} of{" "}
                {leaderboardData?.metadata.total || 0} players
              </>
            )}
          </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* User Profile Modal */}
      <Dialog open={showUserProfile} onOpenChange={setShowUserProfile}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-playfair)]">
              {selectedUser ? `${getUserDisplayName(selectedUser.user)} Profile` : "User Profile"}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="mt-4">
              <UserProfileCard 
                user={selectedUser} 
                profileData={{
                  user: selectedUser.user,
                  globalRank: selectedUser.rank,
                  totalUsers: leaderboardData?.metadata.totalUsers || 1000,
                  stats: {
                    totalScore: selectedUser.totalScore,
                    solveCount: selectedUser.solveCount,
                    ctfCount: selectedUser.ctfCount,
                    categoriesCount: selectedUser.categories.length,
                    averageScorePerSolve: selectedUser.totalScore / selectedUser.solveCount,
                    averageSolvesPerCTF: selectedUser.solveCount / selectedUser.ctfCount
                  },
                  categoryBreakdown: selectedUser.categories.map((category, index) => {
                    // Calculate proportional distribution of user's stats across categories
                    const totalCategories = selectedUser.categories.length
                    const avgSolvesPerCategory = Math.floor(selectedUser.solveCount / totalCategories)
                    const avgPointsPerCategory = Math.floor(selectedUser.totalScore / totalCategories)
                    
                    // Add remainder to first categories to match totals exactly
                    const solveRemainder = index < (selectedUser.solveCount % totalCategories) ? 1 : 0
                    const pointsRemainder = index === 0 ? selectedUser.totalScore % totalCategories : 0
                    
                    const solves = avgSolvesPerCategory + solveRemainder
                    const totalPoints = avgPointsPerCategory + pointsRemainder
                    
                    return {
                      name: category,
                      solves,
                      totalPoints,
                      avgPoints: solves > 0 ? Math.round(totalPoints / solves) : 0
                    }
                  }),
                  ctfParticipation: [],
                  recentActivity: selectedUser.recentSolves,
                  achievements: [],
                  metadata: {
                    profileGenerated: new Date().toISOString(),
                    dataSource: "Leaderboard Data"
                  }
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
