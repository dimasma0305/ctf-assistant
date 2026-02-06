"use client"

import { useState, useRef, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Trophy, Medal, Award, Search, AlertCircle, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useScoreboard } from "@/hooks/useAPI"
import type { LeaderboardEntry } from "@/lib/types"

interface SearchLeaderboardProps {
  onUserClick: (user: LeaderboardEntry) => void
}

export function SearchLeaderboard({ onUserClick }: SearchLeaderboardProps) {
  const [searchInput, setSearchInput] = useState("")
  const [searchResults, setSearchResults] = useState<LeaderboardEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout>()
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const {
    data: searchData,
    loading: searchLoading,
    error: searchError,
    updateParams: updateSearchParams,
  } = useScoreboard({
    limit: 20, // Limit search results
    offset: 0,
    global: true,
  })

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value)

    if (!value.trim()) {
      setShowResults(false)
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // Set new timeout for debounced search
    debounceTimeoutRef.current = setTimeout(() => {
      updateSearchParams({
        offset: 0,
        limit: 20,
        global: true,
        search: value.trim(),
      })
    }, 500)
  }

  const handleSearchFocus = () => {
    console.log("[v0] Search expanding, current scroll position:", window.scrollY)
    setIsExpanded(true)
    // Focus the input after animation completes
    setTimeout(() => {
      searchInputRef.current?.focus()
      console.log("[v0] Search input focused, container position:", searchContainerRef.current?.getBoundingClientRect())
    }, 300)
  }

  const handleSearchCollapse = () => {
    setIsExpanded(false)
    setShowResults(false)
    setSearchInput("")
    setSearchResults([])
    setIsSearching(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isExpanded && searchContainerRef.current) {
        const target = event.target as Element

        // Check if clicking on profile dialog elements
        const isProfileClick =
          target.closest("[data-profile-card]") ||
          target.closest("[data-user-profile]") ||
          target.closest(".user-profile-card") ||
          target.closest('[role="dialog"]')

        // If clicking on profile elements, don't close search
        if (isProfileClick) {
          return
        }

        // Check if there's an open profile dialog
        const hasOpenProfile = document.querySelector(
          '[data-profile-card], [data-user-profile], .user-profile-card, [role="dialog"]',
        )

        // If clicking outside search container
        if (!searchContainerRef.current.contains(event.target as Node)) {
          // If there's an open profile dialog, try to close it instead of the search
          if (hasOpenProfile) {
            // Try to find and click the close button in the profile dialog
            const closeButton = document.querySelector(
              '[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has(svg), .user-profile-card button:has(svg)',
            )
            if (closeButton) {
              ;(closeButton as HTMLElement).click()
              return
            }

            // If no close button found, send escape key to close dialog
            const escapeEvent = new KeyboardEvent("keydown", {
              key: "Escape",
              code: "Escape",
              keyCode: 27,
              which: 27,
              bubbles: true,
              cancelable: true,
            })
            document.dispatchEvent(escapeEvent)
            return
          }

          // No profile dialog open, close the search
          handleSearchCollapse()
        }
      }
    }

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside)
      // Prevent body scroll when expanded
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "unset"
    }
  }, [isExpanded])

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        handleSearchCollapse()
      }
    }

    document.addEventListener("keydown", handleEscapeKey)
    return () => document.removeEventListener("keydown", handleEscapeKey)
  }, [isExpanded])

  useEffect(() => {
    if (searchData && searchInput.trim()) {
      setSearchResults(searchData.data)
      setShowResults(true)
      setIsSearching(false)
    }
  }, [searchData, searchInput])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-4 h-4 text-yellow-500" />
      case 2:
        return <Medal className="w-4 h-4 text-gray-400" />
      case 3:
        return <Award className="w-4 h-4 text-amber-600" />
      default:
        return (
          <span className="w-4 h-4 flex items-center justify-center text-xs font-bold text-muted-foreground">
            #{rank}
          </span>
        )
    }
  }

  const getUserInitials = (user: LeaderboardEntry["user"]) => {
    const name = user.displayName || user.username
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const getUserDisplayName = (user: LeaderboardEntry["user"]) => {
    return user.displayName || user.username
  }

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  return (
    <>
      {isExpanded && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-all duration-300 ease-in-out" />
      )}

      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded
            ? "fixed z-50 w-full max-w-2xl px-4 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            : "relative"
        }`}
        ref={searchContainerRef}
      >
        {/* Search Input */}
        <div className="relative flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search users..."
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onFocus={!isExpanded ? handleSearchFocus : undefined}
            className={`transition-all duration-300 ease-in-out ${
              isExpanded ? "w-full h-12 text-lg px-4 bg-card border-2 border-primary/50 shadow-2xl" : "w-64 h-9"
            }`}
          />
          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSearchCollapse}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted/50"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {(isSearching || searchLoading) && searchInput && !isExpanded && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {isExpanded && (isSearching || searchLoading) && searchInput && (
          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Search Results */}
        {showResults && isExpanded && (
          <div
            className={`mt-4 transition-all duration-300 ease-in-out ${
              isExpanded ? "opacity-100 transform translate-y-0" : "opacity-0 transform -translate-y-2"
            }`}
          >
            <Card className="shadow-2xl border-2 border-primary/20">
              <CardContent className="p-0 max-h-96 overflow-y-auto">
                {searchError ? (
                  <Alert variant="destructive" className="m-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Failed to search: {searchError}</AlertDescription>
                  </Alert>
                ) : searchResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12">Rank</TableHead>
                        <TableHead>Player</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-right">Solves</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.slice(0, 5).map((entry) => (
                        <TableRow
                          key={entry.user.userId}
                          className="hover:bg-muted/50 cursor-pointer transition-colors duration-200"
                          onClick={() => {
                            onUserClick(entry)
                          }}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center justify-center">{getRankIcon(entry.rank)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-6 h-6">
                                <CachedAvatarImage
                                  src={
                                    entry.user.avatar ||
                                    `/abstract-geometric-shapes.png?height=24&width=24&query=user-${entry.user.userId}`
                                  }
                                  loadingPlaceholder={
                                    <div className="w-2 h-2 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                  }
                                />
                                <AvatarFallback className="text-xs bg-primary/20 text-foreground font-medium">
                                  {getUserInitials(entry.user)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="font-medium">{getUserDisplayName(entry.user)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-mono text-sm font-bold text-primary">
                              {formatScore(entry.totalScore)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {entry.solveCount}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6 text-center text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">
                      No players found matching &quot;{searchInput}&quot;
                    </p>
                    <p className="text-sm mt-1">Try a different search term</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
