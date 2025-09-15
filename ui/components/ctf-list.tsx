"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage, CachedAvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar, Users, Trophy, ExternalLink, Search, MapPin, AlertCircle } from "lucide-react"
import { useCTFs, useCTFDetails } from "@/hooks/useAPI"
import { CTFResponse, CTFDetailsResponse } from "@/lib/types"

export function CTFList() {
  const [selectedCTFId, setSelectedCTFId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [formatFilter, setFormatFilter] = useState<string>("all")

  // Use API hooks
  const { data: ctfsData, loading, error, updateParams } = useCTFs({
    limit: 50, // Get more CTFs for filtering
    hasParticipation: true, // Only show CTFs we participated in by default
    sortBy: 'start_desc'
  })

  const { data: selectedCTFDetails, loading: detailLoading, error: detailError } = useCTFDetails(selectedCTFId)

  // Filter CTFs based on search and filters
  const filteredCTFs = (ctfsData?.data || []).filter((ctf) => {
    const matchesSearch =
      ctf.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ctf.organizer.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || ctf.schedule.status === statusFilter
    const matchesFormat = formatFilter === "all" || ctf.format.toLowerCase() === formatFilter.toLowerCase()

    return matchesSearch && matchesStatus && matchesFormat
  })

  const handleCTFClick = (ctfId: string) => {
    setSelectedCTFId(ctfId)
  }

  const handleCloseModal = () => {
    setSelectedCTFId(null)
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

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3 mb-4"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-muted rounded w-16"></div>
                <div className="h-6 bg-muted rounded w-20"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load CTF data: {error}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search CTFs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="jeopardy">Jeopardy</SelectItem>
            <SelectItem value="attack-defense">Attack-Defense</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* CTF List */}
      <div className="space-y-4">
        {filteredCTFs.map((ctf) => (
          <Card
            key={ctf.ctf_id}
            className="hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => handleCTFClick(ctf.ctf_id)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <Avatar className="h-12 w-12">
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

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg text-foreground truncate">{ctf.title}</h3>
                      <Badge className={`text-xs ${getStatusColor(ctf.schedule.status)}`}>{ctf.schedule.status}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">by {ctf.organizer}</p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(ctf.schedule.start)} - {formatDate(ctf.schedule.finish)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {ctf.participants.toLocaleString()} participants
                      </div>
                      <div className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        Weight: {ctf.weight}
                      </div>
                      {ctf.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ctf.location}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {ctf.communityParticipation.uniqueParticipants} players
                  </div>
                  <div className="text-xs text-muted-foreground">{ctf.communityParticipation.totalSolves} solves</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CTF Detail Modal */}
      <Dialog open={!!selectedCTFId} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {detailLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading CTF details...</p>
            </div>
          ) : detailError ? (
            <div className="p-8 text-center">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load CTF details: {detailError}
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            selectedCTFDetails && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <CachedAvatarImage 
                        src={selectedCTFDetails.logo || "/placeholder.svg"}
                        loadingPlaceholder={
                          <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        }
                      />
                      <AvatarFallback className="bg-primary/20 text-foreground text-lg">
                        {selectedCTFDetails.title.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-2xl font-[family-name:var(--font-playfair)]">
                        {selectedCTFDetails.title}
                      </DialogTitle>
                      <DialogDescription className="text-base">
                        {selectedCTFDetails.organizer} • {selectedCTFDetails.format} • Weight: {selectedCTFDetails.weight}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Description */}
                  {selectedCTFDetails.description && (
                    <div>
                      <h4 className="font-semibold mb-2">Description</h4>
                      <p className="text-muted-foreground">{selectedCTFDetails.description}</p>
                    </div>
                  )}

                  {/* Community Stats */}
                  <div>
                    <h4 className="font-semibold mb-3">Community Participation</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {selectedCTFDetails.communityStats.uniqueParticipants}
                          </div>
                          <div className="text-xs text-muted-foreground">Participants</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {selectedCTFDetails.communityStats.totalSolves}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Solves</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {selectedCTFDetails.communityStats.challengesSolved}
                          </div>
                          <div className="text-xs text-muted-foreground">Challenges</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-primary">
                            {selectedCTFDetails.communityStats.categoriesCovered}
                          </div>
                          <div className="text-xs text-muted-foreground">Categories</div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <h4 className="font-semibold mb-3">Categories</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedCTFDetails.communityStats.categories.map((category) => (
                        <Badge key={category} variant="secondary">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Top Performers */}
                  <div>
                    <h4 className="font-semibold mb-3">Top Performers</h4>
                    <div className="space-y-2">
                      {selectedCTFDetails.leaderboard.map((player) => (
                        <div
                          key={player.user.userId}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="w-8 h-8 rounded-full flex items-center justify-center p-0"
                            >
                              {player.rank}
                            </Badge>
                            <span className="font-medium">{player.user.displayName || player.user.username}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-primary">{player.score.toFixed(1)}</div>
                            <div className="text-xs text-muted-foreground">{player.solves} solves</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* External Link */}
                  <div className="flex justify-end">
                    <Button variant="outline" asChild>
                      <a
                        href={selectedCTFDetails.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Visit CTF Website
                      </a>
                    </Button>
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
