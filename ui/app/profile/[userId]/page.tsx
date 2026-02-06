"use client"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Trophy, Star, Users, Clock, Award, Target, Zap, TrendingUp, Crown, Lock } from "lucide-react"
import { calculatePercentile, getAchievements, getCategoryColor } from "@/lib/utils"
import { CertificateGenerator } from "@/components/certificate-generator"
import { ACHIEVEMENTS, getUnlockedAchievementsWithHierarchy } from "@/lib/achievements"
import { WindowProvider } from "@/components/ui/window"

import Link from "next/link"
import { useCTFProfileDetailed, useUserProfile } from "@/hooks/useAPI"
import type { Achievement, UserProfileResponse, UserSolve } from "@/lib/types"
import { ScoreDisplay } from "@/components/score-display"

function CTFSolveList({ userId, ctfId, enabled }: { userId: string; ctfId: string; enabled: boolean }) {
  const { data, loading, error } = useCTFProfileDetailed(userId, ctfId, enabled)

  if (!enabled) return null

  if (loading) {
    return <div className="text-sm text-muted-foreground py-2">Loading solves...</div>
  }

  if (error) {
    return <div className="text-sm text-destructive py-2">Failed to load solves: {error}</div>
  }

  const solves = data?.allSolves ?? []
  const ctftimeParticipants = data?.ctftimeParticipants ?? 0
  if (solves.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">No solves found for this CTF.</div>
  }

  return (
    <div className="pt-3 space-y-2">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Users className="w-3.5 h-3.5" />
        <span>
          Showing solve rate vs CTFtime participants:{" "}
          <span className="font-medium">{ctftimeParticipants || "?"}</span>
        </span>
      </div>
      {solves.map((solve: UserSolve, idx: number) => {
        const solvers = solve.solves ?? 0
        const denom = ctftimeParticipants > 0 ? ctftimeParticipants : 0
        const rate = denom > 0 ? Math.min((solvers / denom) * 100, 100) : 0

        return (
          <div
            key={`${solve.ctf_id}:${solve.challenge}:${solve.solved_at}:${idx}`}
            className="p-3 bg-background/60 border border-primary/10 hover:border-primary/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-foreground truncate">{solve.challenge}</div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <Badge variant="outline" className="text-xs capitalize">
                    {solve.category}
                  </Badge>
                  {solve.isTeamSolve && (
                    <Badge variant="secondary" className="text-xs">
                      Team
                    </Badge>
                  )}
                  {typeof solve.solves === "number" && (
                    <Badge variant="secondary" className="text-xs bg-muted/60 text-foreground">
                      {solvers}/{denom || "?"} solvers
                    </Badge>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-primary">{solve.points} pts</div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(solve.solved_at).toLocaleString()}
                </div>
              </div>
            </div>

            {typeof solve.solves === "number" && denom > 0 && (
              <div className="mt-2">
                <Progress value={rate} className="h-2" />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Solve rate: {rate.toFixed(1)}%
                </div>
              </div>
            )}

            {solve.teammates && solve.teammates.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground truncate">With: {solve.teammates.join(", ")}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.userId as string

  const { data: profileData, loading, error } = useUserProfile(userId)
  const [expandedCtfId, setExpandedCtfId] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<"categories" | "ctfs" | "achievements" | "certificates" | "activity">(
    "categories",
  )

  const setTabHash = (tab: string) => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.hash = tab
    window.history.replaceState({}, "", url)
  }

  const tabFromHash = (hash: string) => {
    const key = (hash || "").replace(/^#/, "").toLowerCase()
    switch (key) {
      case "categories":
      case "ctfs":
      case "achievements":
      case "certificates":
      case "activity":
        return key
      default:
        return null
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const applyFromHash = () => {
      const tab = tabFromHash(window.location.hash)
      if (tab) {
        setSelectedTab(tab)
        return
      }
      // If no valid hash, write the default so the URL is shareable.
      setTabHash("categories")
    }

    // Initial read
    applyFromHash()

    // Keep in sync when user navigates back/forward or edits the hash.
    window.addEventListener("hashchange", applyFromHash)
    return () => window.removeEventListener("hashchange", applyFromHash)
  }, [])


  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 24) {
      return `${diffInHours}h ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays}d ago`
    }
  }

  function getUserInitials(user: UserProfileResponse["user"]) {
    const name = user.displayName || user.username
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }


  const achievements: Achievement[] = getAchievements(profileData?.achievementIds || [])
  const allAchievements = Object.values(ACHIEVEMENTS)
  const unlockedAchievementIds = getUnlockedAchievementsWithHierarchy(profileData?.achievementIds || [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="space-y-8">
            <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
            <div className="h-48 bg-muted animate-pulse rounded-2xl" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-destructive/20 rounded-full flex items-center justify-center">
            <Trophy className="w-12 h-12 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">Error Loading Profile</h1>
            <p className="text-muted-foreground mb-2">HTTP 404</p>
            <p className="text-sm text-muted-foreground mb-6">Debug: {error}</p>
          </div>
          <Link href="/">
            <Button size="lg" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto bg-muted rounded-full flex items-center justify-center">
            <Users className="w-12 h-12 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">Profile Not Found</h1>
            <p className="text-muted-foreground mb-6">The requested user profile could not be found.</p>
          </div>
          <Link href="/">
            <Button size="lg" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <WindowProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/">
                <Button variant="ghost" size="lg" className="gap-2 hover:bg-primary/10">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Users className="w-3 h-3" />
                  Profile View
                </Badge>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-7xl">
          <Card className="mb-8 border-l-4 border-l-primary shadow-lg">
            <CardHeader className="pb-6 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-24 h-24 ring-4 ring-primary/30 shadow-lg">
                      <CachedAvatarImage
                        src={
                          profileData.user.avatar ||
                          `/abstract-geometric-shapes.png?key=profile&height=128&width=128&query=${profileData.user.userId}`
                        }
                        loadingPlaceholder={
                          <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        }
                      />
                      <AvatarFallback className="text-2xl bg-primary/20 text-primary font-bold">
                        {getUserInitials(profileData.user)}
                      </AvatarFallback>
                    </Avatar>
                    {profileData.globalRank <= 3 && (
                      <div className="absolute -top-2 -right-2">
                        <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 p-2 rounded-full shadow-lg border-2 border-yellow-300">
                          <Crown className="w-4 h-4 text-yellow-900" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <CardTitle className="text-2xl sm:text-3xl font-bold mb-3 text-primary font-[family-name:var(--font-playfair)]">
                      {profileData.user.displayName || profileData.user.username}
                    </CardTitle>

                    <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/15 rounded-full border border-primary/30">
                        <Trophy className="w-4 h-4 text-primary" />
                        <span className="font-medium text-primary text-sm">Global Rank #{profileData.globalRank}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-chart-2/15 rounded-full border border-chart-2/30">
                        <Users className="w-4 h-4 text-chart-2" />
                        <span className="text-chart-2 font-medium text-sm">
                          Top {calculatePercentile(profileData.globalRank, profileData.totalUsers)}%
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="gap-1 px-3 py-1.5 bg-chart-3/15 text-chart-3 border-chart-3/30 text-sm"
                      >
                        Elite Player
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">Total Score</span>
                    </div>
                    <ScoreDisplay score={profileData.stats.totalScore} className="text-xl text-primary block" />
                  </div>

                  <div className="text-center p-4 bg-chart-3/10 rounded-lg border border-chart-3/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-chart-3" />
                      <span className="text-sm font-medium text-chart-3">Challenges</span>
                    </div>
                    <div className="text-xl font-bold text-chart-3">{profileData.stats.solveCount}</div>
                  </div>

                  <div className="text-center p-4 bg-chart-2/10 rounded-lg border border-chart-2/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Trophy className="w-4 h-4 text-chart-2" />
                      <span className="text-sm font-medium text-chart-2">CTFs</span>
                    </div>
                    <div className="text-xl font-bold text-chart-2">{profileData.stats.ctfCount}</div>
                  </div>

                  <div className="text-center p-4 bg-chart-4/10 rounded-lg border border-chart-4/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Award className="w-4 h-4 text-chart-4" />
                      <span className="text-sm font-medium text-chart-4">Categories</span>
                    </div>
                    <div className="text-xl font-bold text-chart-4">{profileData.stats.categoriesCount}</div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div id="profile-tabs" />
          <Tabs
            value={selectedTab}
            onValueChange={(v) => {
              const tab = tabFromHash(`#${v}`)
              if (!tab) return
              setSelectedTab(tab)
              setTabHash(tab)
              // Close expanded CTF when leaving/entering via hash navigation.
              if (tab !== "ctfs") setExpandedCtfId(null)
              document.getElementById("profile-tabs")?.scrollIntoView({ block: "start" })
            }}
            className="space-y-4 sm:space-y-6"
          >
            <div className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto p-1 bg-muted/50 gap-1">
                <TabsTrigger
                  value="categories"
                  className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Star className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Categories</span>
                  <span className="xs:hidden">Cat</span>
                </TabsTrigger>
                <TabsTrigger
                  value="ctfs"
                  className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Trophy className="w-4 h-4 mr-1 sm:mr-2" />
                  <span>CTFs</span>
                </TabsTrigger>
                <TabsTrigger
                  value="achievements"
                  className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Award className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Awards</span>
                  <span className="xs:hidden">Awd</span>
                </TabsTrigger>
                <TabsTrigger
                  value="certificates"
                  className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Award className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Certificates</span>
                  <span className="xs:hidden">Cert</span>
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="text-xs sm:text-sm h-10 !text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground col-span-2 sm:col-span-1"
                >
                  <TrendingUp className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Activity</span>
                  <span className="xs:hidden">Act</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="categories">
              <Card className="border-l-4 border-l-primary shadow-lg">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-primary" />
                    <CardTitle className="font-[family-name:var(--font-playfair)]">Category Performance</CardTitle>
                  </div>
                  <CardDescription>Breakdown of performance across different challenge categories</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-6">
                  {profileData.categoryBreakdown.map((category) => (
                    <div
                      key={category.name}
                      className="space-y-3 p-4 rounded-lg bg-muted/30 border border-primary/10 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${getCategoryColor(category.name)}`} />
                          <span className="font-medium capitalize text-foreground">{category.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-foreground">{category.solves} solves</div>
                          <div className="text-sm text-muted-foreground">{category.totalScore} total score</div>
                        </div>
                      </div>
                      <Progress value={(category.solves / profileData.stats.solveCount) * 100} className="h-3" />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {Math.round((category.solves / profileData.stats.solveCount) * 100)}% of total solves
                        </span>
                        <span className="text-muted-foreground">Avg: {category.avgPoints} pts/solve</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ctfs">
              <Card className="border-l-4 border-l-chart-3 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-chart-3/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-chart-3" />
                    <CardTitle className="font-[family-name:var(--font-playfair)]">CTF Participation History</CardTitle>
                  </div>
                  <CardDescription>Performance in individual CTF competitions</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {profileData.ctfBreakdown.map((ctf) => (
                      <Card
                        key={ctf.ctf_id}
                        className="p-4 hover:shadow-md transition-all duration-300 border border-primary/10 bg-muted/20"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                          <div className="flex items-center gap-3 lg:flex-col lg:items-center">
                            <Avatar className="w-12 h-12 lg:w-16 lg:h-16 border border-primary/20 flex-shrink-0">
                              <CachedAvatarImage
                                src={ctf.logo || `/placeholder.svg?height=64&width=64&query=CTF+logo+${ctf.ctfTitle}`}
                                loadingPlaceholder={
                                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                                }
                              />
                              <AvatarFallback className="text-sm font-bold bg-primary/20 text-primary">
                                {ctf.ctfTitle
                                  .split(" ")
                                  .map((word) => word[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 lg:hidden">
                              <h3 className="font-bold text-lg text-foreground">{ctf.ctfTitle}</h3>
                            </div>
                            <div className="text-right lg:hidden flex-shrink-0">
                              <div className="text-xs text-muted-foreground">Score</div>
                              <ScoreDisplay score={ctf.score} className="text-xl text-foreground block" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="hidden lg:block mb-3">
                              <h3 className="font-bold text-xl text-foreground mb-1">{ctf.ctfTitle}</h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Weight:</span>
                                <Badge
                                  variant="secondary"
                                  className="px-2 py-1 bg-primary/15 text-primary border-primary/20"
                                >
                                  {ctf.weight}x
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Solves:</span>
                                <Badge
                                  variant="outline"
                                  className="px-2 py-1 border-chart-3/20 text-chart-3 bg-chart-3/10"
                                >
                                  {ctf.solves}
                                </Badge>
                              </div>
                              <div className="hidden lg:block ml-auto text-right">
                                <div className="text-sm text-muted-foreground">Score</div>
                                <ScoreDisplay score={ctf.score} className="text-2xl text-foreground block" />
                              </div>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-primary to-chart-2 rounded-full h-2 transition-all duration-300"
                                style={{
                                  width: `${Math.min((ctf.score / Math.max(...profileData.ctfBreakdown.map((c) => c.score))) * 100, 100)}%`,
                                }}
                              />
                            </div>

                            <div className="mt-4 pt-3 border-t border-primary/10">
                              <Button
                                type="button"
                                variant="link"
                                className="p-0 h-auto text-sm text-primary underline underline-offset-2 hover:opacity-80"
                                onClick={() => setExpandedCtfId((prev) => (prev === ctf.ctf_id ? null : ctf.ctf_id))}
                              >
                                {expandedCtfId === ctf.ctf_id
                                  ? "Hide solved challenges"
                                  : `Show solved challenges (${ctf.solves})`}
                              </Button>
                              <CTFSolveList userId={userId} ctfId={ctf.ctf_id} enabled={expandedCtfId === ctf.ctf_id} />
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="achievements">
              <Card className="border-l-4 border-l-chart-2 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-chart-2/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-chart-2" />
                    <CardTitle className="font-[family-name:var(--font-playfair)]">Achievements & Milestones</CardTitle>
                  </div>
                  <CardDescription>Recognition for exceptional performance and participation</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Achievement Progress</span>
                      <span className="text-sm text-muted-foreground">
                        {achievements.length} / {allAchievements.length}
                      </span>
                    </div>
                    <Progress value={(achievements.length / allAchievements.length) * 100} className="h-2" />
                  </div>

                  {["ranking", "participation", "skill", "contribution"].map((category) => {
                    const categoryAchievements = allAchievements.filter(
                      (achievement) => achievement.category === category,
                    )
                    const categoryName = category.charAt(0).toUpperCase() + category.slice(1)

                    return (
                      <div key={category} className="mb-8">
                        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                          {category === "ranking" && <Trophy className="w-4 h-4" />}
                          {category === "participation" && <Target className="w-4 h-4" />}
                          {category === "skill" && <Zap className="w-4 h-4" />}
                          {category === "contribution" && <Users className="w-4 h-4" />}
                          {categoryName}
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {categoryAchievements.map((achievement) => {
                            const isUnlocked = unlockedAchievementIds.has(achievement.id)
                            return (
                              <Card
                                key={achievement.id}
                                className={`p-4 border transition-all duration-300 ${isUnlocked
                                  ? "border-primary/20 bg-gradient-to-br from-primary/10 to-chart-3/5 hover:shadow-md"
                                  : "border-muted/20 bg-muted/10 opacity-60"
                                  }`}
                              >
                                <div className="flex items-center gap-4">
                                  <div
                                    className={`text-3xl p-3 rounded-lg ${isUnlocked ? "bg-white/20" : "bg-muted/20"}`}
                                  >
                                    {isUnlocked ? achievement.icon : <Lock className="w-6 h-6 text-muted-foreground" />}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h3
                                        className={`font-bold ${isUnlocked ? "text-foreground" : "text-muted-foreground"
                                          }`}
                                      >
                                        {achievement.name}
                                      </h3>
                                      {isUnlocked && (
                                        <Badge
                                          variant="secondary"
                                          className="px-2 py-1 bg-primary/15 text-primary border-primary/20 text-xs"
                                        >
                                          Unlocked
                                        </Badge>
                                      )}
                                    </div>
                                    <p
                                      className={`text-sm ${isUnlocked ? "text-muted-foreground" : "text-muted-foreground/70"
                                        }`}
                                    >
                                      {achievement.description}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="certificates">
              <Card className="border-l-4 border-l-orange-500 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-orange-500/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-orange-500" />
                    <CardTitle className="font-[family-name:var(--font-playfair)]">
                      Certificates & Recognition
                    </CardTitle>
                  </div>
                  <CardDescription>Official certificates for outstanding performance</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <CertificateGenerator userId={userId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card className="border-l-4 border-l-chart-4 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-chart-4/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-chart-4" />
                    <CardTitle className="font-[family-name:var(--font-playfair)]">Recent Activity</CardTitle>
                  </div>
                  <CardDescription>Latest challenge solves and participation</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {profileData.recentSolves.map((activity, index) => (
                      <Card
                        key={index}
                        className="p-4 border border-primary/10 bg-muted/20 hover:shadow-md transition-all duration-300"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-3 h-3 rounded-full ${getCategoryColor(activity.category)}`} />
                            <div>
                              <h3 className="font-semibold text-foreground mb-1">{activity.challenge}</h3>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge
                                  variant="outline"
                                  className="px-2 py-1 border-primary/20 text-primary bg-primary/10"
                                >
                                  {activity.category}
                                </Badge>
                                <span className="font-bold text-primary">{activity.points} points</span>
                                {activity.isTeamSolve && (
                                  <Badge
                                    variant="secondary"
                                    className="px-2 py-1 bg-chart-3/15 text-chart-3 border-chart-3/20"
                                  >
                                    Team solve with {activity.teammates?.length || 0} others
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {formatTimeAgo(activity.solved_at)}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </WindowProvider>
  )
}
