"use client"

import { useState, useEffect, useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Users, Target, Activity, Sparkles, Hexagon, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LeaderboardTable } from "@/components/leaderboard-table"
import { CTFList } from "@/components/ctf-list"
import { CTFRankings } from "@/components/ctf-rankings"
import { useScoreboard, useCTFs } from "@/hooks/useAPI"
import Image from "next/image"
import { Footer } from "@/components/footer"

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("leaderboard")

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
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${value}`)
    }
  }

  const { data: leaderboardData, isStale: leaderboardStale } = useScoreboard({ limit: 1 })
  const { data: ctfsData, isStale: ctfsStale } = useCTFs({ limit: 1 })
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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
    <div className="min-h-screen bg-background relative overflow-hidden font-sans selection:bg-primary/30 selection:text-primary">
      {/* Ambient Background Orbs - Optimized */}
      <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden h-screen w-screen contain-strict">
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full animate-blob pointer-events-none" style={{ background: 'radial-gradient(circle, oklch(var(--primary) / 0.15) 0%, transparent 70%)' }} />
        <div className="absolute top-[20%] right-[-10%] w-[30vw] h-[30vw] rounded-full animate-blob animation-delay-2000 pointer-events-none" style={{ background: 'radial-gradient(circle, oklch(var(--accent) / 0.15) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-20%] left-[20%] w-[50vw] h-[50vw] rounded-full animate-blob animation-delay-4000 pointer-events-none" style={{ background: 'radial-gradient(circle, oklch(var(--chart-2) / 0.15) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="glass-panel sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/80 to-accent/80 p-[1px] shadow-lg neon-glow-primary group overflow-hidden">
                  <div className="absolute inset-0 bg-background/50 backdrop-blur-sm group-hover:bg-background/30 transition-colors z-0" />
                  <Image
                    src="/tcp1p-logo.png"
                    alt="TCP1P Logo"
                    width={36}
                    height={36}
                    className="w-8 h-8 object-contain relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70">
                    TCP1P Community Scoring
                  </h1>
                  <p className="text-xs sm:text-sm font-medium text-primary tracking-wide flex items-center gap-1.5 hidden xs:flex">
                    <Sparkles className="w-3 h-3 animate-pulse" /> Competitive Cybersecurity Platform
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10 text-primary backdrop-blur-md shadow-[0_0_10px_-2px_var(--primary)] px-3 py-1 text-xs">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  <span className="hidden xs:inline font-semibold">Live System</span>
                </Badge>
                {(leaderboardStale || ctfsStale) && (
                  <Badge variant="outline" className="gap-1.5 border-chart-3/30 bg-chart-3/10 text-chart-3 backdrop-blur-md px-3 py-1 text-xs">
                    <div className="w-2 h-2 bg-chart-3 rounded-full animate-pulse shadow-[0_0_5px_currentColor]" />
                    <span className="hidden sm:inline font-semibold">Syncing</span>
                  </Badge>
                )}
                {mounted && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-9 w-9 rounded-lg border border-border/50 bg-background/50 backdrop-blur-md hover:bg-primary/10"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4 text-primary" />
                    ) : (
                      <Moon className="h-4 w-4 text-primary" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-5 sm:gap-6 mb-8 sm:mb-12 auto-rows-[160px]">
            <Card
              className="bento-card col-span-1 md:col-span-2 lg:col-span-2 group border-t-white/5 border-l-white/5 hover:border-primary/40"
              role="region"
              aria-label="Total Players Statistics"
            >
              <div className="frosted-noise" aria-hidden="true" />
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-10 translate-x-10 group-hover:bg-primary/30 transition-colors duration-700 pointer-events-none" aria-hidden="true" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]" id="total-players-title">Total Players</CardTitle>
                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 group-hover:neon-glow-primary transition-all duration-300">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10 flex flex-col justify-end h-[calc(100%-70px)]">
                <div
                  className="text-5xl sm:text-6xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent mb-1 drop-shadow-lg"
                  aria-labelledby="total-players-title"
                  aria-live="polite"
                >
                  {stats.totalUsers.toLocaleString() || "—"}
                </div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground opacity-80">Active community members</p>
              </CardContent>
            </Card>

            <Card
              className="bento-card col-span-1 md:col-span-2 lg:col-span-2 group border-t-white/5 border-l-white/5 hover:border-chart-3/40"
              role="region"
              aria-label="CTF Events Statistics"
            >
              <div className="frosted-noise" aria-hidden="true" />
              <div className="absolute bottom-0 right-0 w-48 h-48 bg-chart-3/10 rounded-full blur-3xl translate-y-10 translate-x-10 group-hover:bg-chart-3/30 transition-colors duration-700 pointer-events-none" aria-hidden="true" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]" id="ctf-events-title">CTF Events</CardTitle>
                <div className="p-3 bg-chart-3/10 rounded-2xl border border-chart-3/20 group-hover:shadow-[0_0_20px_-5px_var(--chart-3)] transition-all duration-300">
                  <Target className="h-5 w-5 text-chart-3" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10 flex flex-col justify-end h-[calc(100%-70px)]">
                <div
                  className="text-5xl sm:text-6xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-chart-3 to-chart-4 mb-1 drop-shadow-lg"
                  aria-labelledby="ctf-events-title"
                  aria-live="polite"
                >
                  {stats.totalCTFs || "—"}
                </div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground opacity-80">
                  {stats.activeCTFs} live · {stats.upcomingCTFs} upcoming
                </p>
              </CardContent>
            </Card>

            <Card
              className="bento-card col-span-1 md:col-span-4 lg:col-span-2 group border-t-white/5 border-l-white/5 hover:border-chart-2/40"
              role="region"
              aria-label="Platform Participation Statistics"
            >
              <div className="frosted-noise" aria-hidden="true" />
              <div className="absolute top-1/2 left-1/2 w-full h-full bg-chart-2/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 group-hover:bg-chart-2/20 transition-colors duration-700 pointer-events-none" aria-hidden="true" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]" id="participation-title">Participation</CardTitle>
                <div className="p-3 bg-chart-2/10 rounded-2xl border border-chart-2/20 group-hover:shadow-[0_0_20px_-5px_var(--chart-2)] transition-all duration-300">
                  <Hexagon className="h-5 w-5 text-chart-2" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10 flex flex-col justify-end h-[calc(100%-70px)]">
                <div
                  className="text-5xl sm:text-6xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-chart-2 to-primary mb-1 drop-shadow-lg"
                  aria-labelledby="participation-title"
                  aria-live="polite"
                >
                  {stats.participationCTFs || "—"}
                </div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground opacity-80">CTFs with community solves</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6 sm:space-y-8">
            <div className="w-full flex justify-center">
              <TabsList className="grid grid-cols-3 w-full max-w-2xl h-14 p-1.5 glass-card rounded-2xl">
                <TabsTrigger
                  value="leaderboard"
                  className="rounded-xl text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:neon-glow-primary data-[state=active]:shadow-none hover:bg-white/5"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Global Leaderboard</span>
                  <span className="sm:hidden">Leaderboard</span>
                </TabsTrigger>
                <TabsTrigger
                  value="ctfs"
                  className="rounded-xl text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-accent/20 data-[state=active]:text-accent data-[state=active]:neon-glow-accent data-[state=active]:shadow-none hover:bg-white/5"
                >
                  <Target className="w-4 h-4 mr-2" />
                  CTF List
                </TabsTrigger>
                <TabsTrigger
                  value="ctf-rankings"
                  className="rounded-xl text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-chart-2/20 data-[state=active]:text-chart-2 data-[state=active]:shadow-[0_0_20px_-5px_var(--chart-2)] data-[state=active]:shadow-none hover:bg-white/5"
                >
                  <Users className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">CTF Rankings</span>
                  <span className="sm:hidden">Rankings</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="relative min-h-[500px]">
              <TabsContent value="leaderboard" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
                <Card className="glass-card border-none overflow-hidden relative shadow-2xl">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary via-accent to-primary" />
                  <CardHeader className="bg-background/20 backdrop-blur-md border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Trophy className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold tracking-tight">Global Leaderboard</CardTitle>
                        <CardDescription className="text-xs sm:text-sm font-medium opacity-80 mt-1">Top performers across all CTF competitions</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6 bg-black/10">
                    {activeTab === "leaderboard" && <LeaderboardTable />}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ctfs" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
                <Card className="glass-card border-none overflow-hidden relative shadow-2xl">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-accent via-chart-3 to-accent" />
                  <CardHeader className="bg-background/20 backdrop-blur-md border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-lg">
                        <Target className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold tracking-tight">CTF Competitions</CardTitle>
                        <CardDescription className="text-xs sm:text-sm font-medium opacity-80 mt-1">Browse and explore CTF competitions with community participation</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6 bg-black/10">
                    {activeTab === "ctfs" && <CTFList />}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ctf-rankings" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
                <Card className="glass-card border-none overflow-hidden relative shadow-2xl">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-chart-2 via-primary to-chart-2" />
                  <CardHeader className="bg-background/20 backdrop-blur-md border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-chart-2/10 rounded-lg">
                        <Users className="w-5 h-5 text-chart-2" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold tracking-tight">CTF-Specific Rankings</CardTitle>
                        <CardDescription className="text-xs sm:text-sm font-medium opacity-80 mt-1">Performance breakdown by individual competitions</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6 bg-black/10">
                    {activeTab === "ctf-rankings" && <CTFRankings />}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </main>

        <Footer />
      </div>
    </div>
  )
}
