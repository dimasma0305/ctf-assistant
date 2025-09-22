"use client"

import { useState, useEffect, useMemo } from "react"
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
      const hash = window.location.hash.slice(1)

      if (hash === "leaderboard" || hash === "ctfs" || hash === "ctf-rankings") {
        setActiveTab(hash)
      } else if (
        hash.startsWith("month-") ||
        hash.startsWith("year-") ||
        ["all-time", "this-month", "last-month", "this-year", "last-year"].includes(hash)
      ) {
        setActiveTab("leaderboard")
      }
    }

    handleHashChange()
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    // Use history.replaceState instead of direct hash manipulation to prevent page refresh
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${value}`)
    }
  }

  const { data: leaderboardData, isStale: leaderboardStale } = useScoreboard({ limit: 1 })
  const { data: ctfsData, isStale: ctfsStale } = useCTFs({ limit: 1 })

  const stats = useMemo(
    () => ({
      totalUsers: leaderboardData?.metadata.totalUsers || 0,
      totalCTFs: ctfsData?.metadata.stats.totalCTFsInDatabase || 0,
      activeCTFs: ctfsData?.metadata.stats.active || 0,
      upcomingCTFs: ctfsData?.metadata.stats.upcoming || 0,
      participationCTFs: ctfsData?.metadata.stats.ctfsWithParticipation || 0,
    }),
    [leaderboardData, ctfsData],
  )

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
                  TCP1P Community Scoring
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
              {(leaderboardStale || ctfsStale) && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">Updating</span>
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full -translate-y-10 translate-x-10" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Players</CardTitle>
              <div className="p-2 bg-primary/20 rounded-lg">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-primary mb-1">
                {stats.totalUsers.toLocaleString() || "—"}
              </div>
              <p className="text-xs text-muted-foreground">Active community members</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-chart-3/10 rounded-full -translate-y-10 translate-x-10" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CTF Events</CardTitle>
              <div className="p-2 bg-chart-3/20 rounded-lg">
                <Target className="h-4 w-4 text-chart-3" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-chart-3 mb-1">{stats.totalCTFs || "—"}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeCTFs} active, {stats.upcomingCTFs} upcoming
              </p>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-chart-2/10 rounded-full -translate-y-10 translate-x-10" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Participation</CardTitle>
              <div className="p-2 bg-chart-2/20 rounded-lg">
                <Trophy className="h-4 w-4 text-chart-2" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-chart-2 mb-1">{stats.participationCTFs || "—"}</div>
              <p className="text-xs text-muted-foreground">CTFs with community solves</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="grid w-full grid-cols-3 min-w-[300px] h-12 p-1 bg-muted/50">
              <TabsTrigger
                value="leaderboard"
                className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Trophy className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Global Leaderboard</span>
                <span className="sm:hidden">Leaderboard</span>
              </TabsTrigger>
              <TabsTrigger
                value="ctfs"
                className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Target className="w-4 h-4 mr-2" />
                CTFs
              </TabsTrigger>
              <TabsTrigger
                value="ctf-rankings"
                className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Users className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">CTF Rankings</span>
                <span className="sm:hidden">Rankings</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="leaderboard" className="space-y-6">
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  <CardTitle className="font-[family-name:var(--font-playfair)]">Global Leaderboard</CardTitle>
                </div>
                <CardDescription>Top performers across all CTF competitions</CardDescription>
              </CardHeader>
              <CardContent>{activeTab === "leaderboard" && <LeaderboardTable />}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctfs" className="space-y-6">
            <Card className="border-l-4 border-l-chart-3">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-chart-3" />
                  <CardTitle className="font-[family-name:var(--font-playfair)]">CTF Competitions</CardTitle>
                </div>
                <CardDescription>Browse and explore CTF competitions with community participation</CardDescription>
              </CardHeader>
              <CardContent>{activeTab === "ctfs" && <CTFList />}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctf-rankings" className="space-y-6">
            <Card className="border-l-4 border-l-chart-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-chart-2" />
                  <CardTitle className="font-[family-name:var(--font-playfair)]">CTF-Specific Rankings</CardTitle>
                </div>
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
