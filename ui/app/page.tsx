"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Users, Target, Activity } from "lucide-react"
import { LeaderboardTable } from "@/components/leaderboard-table"
import { CTFList } from "@/components/ctf-list"
import { CTFRankings } from "@/components/ctf-rankings"
import { useScoreboard, useCTFs } from "@/hooks/useAPI"
import Image from "next/image"

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("leaderboard")
  const router = useRouter()

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) // Remove the #
      console.log("[v0] Main page hash changed to:", hash)

      if (hash === "leaderboard" || hash === "ctfs" || hash === "ctf-rankings") {
        setActiveTab(hash)
      } else if (
        hash.startsWith("month-") ||
        hash.startsWith("year-") ||
        ["all-time", "this-month", "last-month", "this-year", "last-year"].includes(hash)
      ) {
        // These are leaderboard time period hashes, switch to leaderboard tab
        console.log("[v0] Switching to leaderboard tab for time period:", hash)
        setActiveTab("leaderboard")
      }
    }

    // Set initial tab from hash
    handleHashChange()

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    window.location.hash = value
  }

  // Get data for stats overview
  const { data: leaderboardData } = useScoreboard({ limit: 1 }) // Just need metadata
  const { data: ctfsData } = useCTFs({ limit: 1 }) // Just need metadata

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg p-1">
                <Image
                  src="/tcp1p-logo.png"
                  alt="TCP1P Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold font-[family-name:var(--font-playfair)] text-foreground">
                  TCP1P CTF Scoring
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">
                  Competitive Cybersecurity Platform
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Activity className="w-3 h-3" />
                <span className="hidden xs:inline">Live</span>
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Players</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-primary">
                {leaderboardData?.metadata.totalUsers.toLocaleString() || "—"}
              </div>
              <p className="text-xs text-muted-foreground">Active community members</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CTF Events</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-primary">
                {ctfsData?.metadata.stats.totalCTFsInDatabase || "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                {ctfsData?.metadata.stats.active || 0} active, {ctfsData?.metadata.stats.upcoming || 0} upcoming
              </p>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Participation</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-primary">
                {ctfsData?.metadata.stats.ctfsWithParticipation || "—"}
              </div>
              <p className="text-xs text-muted-foreground">CTFs with community solves</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="grid w-full grid-cols-3 min-w-[300px]">
              <TabsTrigger value="leaderboard" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Global Leaderboard</span>
                <span className="sm:hidden">Leaderboard</span>
              </TabsTrigger>
              <TabsTrigger value="ctfs" className="text-xs sm:text-sm">
                CTFs
              </TabsTrigger>
              <TabsTrigger value="ctf-rankings" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">CTF Rankings</span>
                <span className="sm:hidden">Rankings</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="leaderboard" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-playfair)]">Global Leaderboard</CardTitle>
                <CardDescription>Top performers across all CTF competitions</CardDescription>
              </CardHeader>
              <CardContent>
                <LeaderboardTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctfs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-playfair)]">CTF Competitions</CardTitle>
                <CardDescription>Browse and explore CTF competitions with community participation</CardDescription>
              </CardHeader>
              <CardContent>
                <CTFList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctf-rankings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-playfair)]">CTF-Specific Rankings</CardTitle>
                <CardDescription>Performance breakdown by individual competitions</CardDescription>
              </CardHeader>
              <CardContent>
                <CTFRankings />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
