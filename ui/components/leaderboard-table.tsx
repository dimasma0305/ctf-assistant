"use client"

import { useState } from "react"
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
  })

  // Update API params when page, size, or CTF selection changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    updateParams({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1) // Reset to first page
    updateParams({
      offset: 0,
      limit: size
    })
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

  const getUserInitials = (userId: string) => {
    // Handle different user ID formats
    if (userId.startsWith("user_")) {
      return userId.replace("user_", "").toUpperCase().slice(0, 2)
    }
    return userId.slice(0, 2).toUpperCase()
  }

  const getUserDisplayName = (userId: string) => {
    if (userId.startsWith("user_")) {
      return userId.replace("user_", "Player ")
    }
    return userId
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
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedCtf} onValueChange={handleCtfChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select CTF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global Rankings</SelectItem>
              <SelectItem value="ctf_2024_001">Winter CTF 2024</SelectItem>
              <SelectItem value="ctf_2024_002">Crypto Challenge</SelectItem>
              <SelectItem value="ctf_2024_003">Web Security CTF</SelectItem>
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
              {leaderboardData?.data.map((user) => (
                <TableRow key={user.userId} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center justify-center">{getRankIcon(user.rank)}</div>
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                      onClick={() => handleUserClick(user)}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={`/abstract-geometric-shapes.png?height=32&width=32&query=${user.userId}`} />
                        <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                          {getUserInitials(user.userId)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium hover:text-primary transition-colors">
                          {getUserDisplayName(user.userId)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {user.rank <= 10 ? "Elite" : user.rank <= 50 ? "Advanced" : "Intermediate"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-mono font-bold text-primary">{formatScore(user.totalScore)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono text-foreground">
                      {user.solveCount}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="font-mono">
                      {user.ctfCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.categories.slice(0, 3).map((category) => (
                        <Badge key={category} variant="secondary" className="text-xs text-foreground">
                          {category}
                        </Badge>
                      ))}
                      {user.categories.length > 3 && (
                        <Badge variant="secondary" className="text-xs text-foreground">
                          +{user.categories.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.recentSolves.length > 0 ? (
                      <div className="text-sm">
                        <div className="font-medium truncate max-w-32">{user.recentSolves[0].challenge}</div>
                        <div className="text-muted-foreground">{user.recentSolves[0].points} pts</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">No recent activity</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {(currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, leaderboardData?.metadata.total || 0)} of{" "}
          {leaderboardData?.metadata.total || 0} players
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
              {selectedUser ? `${getUserDisplayName(selectedUser.userId)} Profile` : "User Profile"}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="mt-4">
              <UserProfileCard user={selectedUser} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
