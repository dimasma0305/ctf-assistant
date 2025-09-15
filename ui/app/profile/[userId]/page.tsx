"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage, CachedAvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Trophy, Star, Users, Clock } from "lucide-react"

import Link from "next/link"

interface UserProfileData {
  userId: string
  globalRank: number
  totalUsers: number
  stats: {
    totalScore: number
    solveCount: number
    ctfCount: number
    categoriesCount: number
    averageScorePerSolve: number
    averageSolvesPerCTF: number
  }
  categoryBreakdown: Array<{
    name: string
    solves: number
    totalPoints: number
    avgPoints: number
  }>
  ctfParticipation: Array<{
    ctfId: string
    ctfTitle: string
    weight: number
    solves: number
    points: number
    score: number
    contribution: number
  }>
  recentActivity: Array<{
    ctf_id: string
    challenge: string
    category: string
    points: number
    solved_at: string
    isTeamSolve: boolean
    teammates: string[]
  }>
  achievements: Array<{
    name: string
    description: string
    icon: string
  }>
}

export default function UserProfilePage() {
  const params = useParams()
  const userId = params.userId as string
  const [profileData, setProfileData] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  // Mock data for demonstration
  const mockProfile: UserProfileData = {
    userId: userId || "user_001",
    globalRank: 1,
    totalUsers: 1247,
    stats: {
      totalScore: 2847.5,
      solveCount: 156,
      ctfCount: 23,
      categoriesCount: 5,
      averageScorePerSolve: 18.3,
      averageSolvesPerCTF: 6.8,
    },
    categoryBreakdown: [
      { name: "web", solves: 45, totalPoints: 1250, avgPoints: 28 },
      { name: "crypto", solves: 38, totalPoints: 980, avgPoints: 26 },
      { name: "pwn", solves: 32, totalPoints: 890, avgPoints: 28 },
      { name: "reverse", solves: 25, totalPoints: 675, avgPoints: 27 },
      { name: "forensics", solves: 16, totalPoints: 420, avgPoints: 26 },
    ],
    ctfParticipation: [
      {
        ctfId: "ctf_2024_001",
        ctfTitle: "Winter CTF 2024",
        weight: 1.2,
        solves: 12,
        points: 3400,
        score: 425.8,
        contribution: 15.0,
      },
      {
        ctfId: "ctf_2024_002",
        ctfTitle: "Crypto Challenge",
        weight: 1.0,
        solves: 8,
        points: 2100,
        score: 312.5,
        contribution: 11.0,
      },
    ],
    recentActivity: [
      {
        ctf_id: "ctf_2024_001",
        challenge: "Advanced SQL Injection",
        category: "web",
        points: 500,
        solved_at: "2024-01-15T10:30:00Z",
        isTeamSolve: false,
        teammates: [],
      },
      {
        ctf_id: "ctf_2024_002",
        challenge: "Buffer Overflow Basics",
        category: "pwn",
        points: 300,
        solved_at: "2024-01-14T15:45:00Z",
        isTeamSolve: true,
        teammates: ["user_005", "user_012"],
      },
    ],
    achievements: [
      { name: "Century Solver", description: "Solved 100+ challenges", icon: "🎯" },
      { name: "CTF Explorer", description: "Participated in 10+ CTFs", icon: "🗺️" },
      { name: "Well Rounded", description: "Solved challenges in 5+ categories", icon: "🌟" },
      { name: "Podium Finisher", description: "Global rank #1", icon: "🥇" },
    ],
  }

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true)
      // In real implementation:
      // const response = await fetch(`/api/profile/${userId}`)
      // const data = await response.json()

      await new Promise((resolve) => setTimeout(resolve, 500))
      setProfileData(mockProfile)
      setLoading(false)
    }

    fetchProfile()
  }, [userId])

  const getUserInitials = (userId: string) => {
    return userId.replace("user_", "").toUpperCase().slice(0, 2)
  }

  const formatScore = (score: number) => {
    return score.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  const getPercentile = (rank: number, total: number) => {
    return Math.round((1 - (rank - 1) / total) * 100)
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      web: "bg-blue-500",
      crypto: "bg-purple-500",
      pwn: "bg-red-500",
      reverse: "bg-green-500",
      forensics: "bg-yellow-500",
      misc: "bg-gray-500",
    }
    return colors[category] || "bg-gray-500"
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Profile Not Found</h1>
          <p className="text-muted-foreground mb-4">The requested user profile could not be found.</p>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Back Navigation */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Profile Header */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <Avatar className="w-24 h-24">
                <CachedAvatarImage
                  src={`/abstract-geometric-shapes.png?key=profile&height=96&width=96&query=${profileData.userId}`}
                  loadingPlaceholder={
                    <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  }
                />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {getUserInitials(profileData.userId)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-3xl font-[family-name:var(--font-playfair)] mb-2">
                  {profileData.userId.replace("user_", "Player ")}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Global Rank #{profileData.globalRank}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Top {getPercentile(profileData.globalRank, profileData.totalUsers)}% of{" "}
                    {profileData.totalUsers.toLocaleString()} players
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Star className="w-3 h-3" />
                    Elite Player
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatScore(profileData.stats.totalScore)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Challenges Solved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{profileData.stats.solveCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">CTFs Participated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{profileData.stats.ctfCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Categories Mastered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{profileData.stats.categoriesCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="categories" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="categories">Category Breakdown</TabsTrigger>
            <TabsTrigger value="ctfs">CTF Participation</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Category Performance</CardTitle>
                <CardDescription>Breakdown of performance across different challenge categories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {profileData.categoryBreakdown.map((category) => (
                  <div key={category.name} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${getCategoryColor(category.name)}`} />
                        <span className="font-medium capitalize text-lg">{category.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{category.solves} solves</div>
                        <div className="text-sm text-muted-foreground">{category.totalPoints} total points</div>
                      </div>
                    </div>
                    <Progress value={(category.solves / profileData.stats.solveCount) * 100} className="h-3" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{Math.round((category.solves / profileData.stats.solveCount) * 100)}% of total solves</span>
                      <span>Avg: {category.avgPoints} pts/solve</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ctfs">
            <Card>
              <CardHeader>
                <CardTitle>CTF Participation History</CardTitle>
                <CardDescription>Performance in individual CTF competitions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profileData.ctfParticipation.map((ctf) => (
                    <Card key={ctf.ctfId} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">{ctf.ctfTitle}</h3>
                          <div className="text-sm text-muted-foreground">
                            Weight: {ctf.weight}x • {ctf.contribution}% of total score
                          </div>
                        </div>
                        <Badge variant="outline">{ctf.solves} solves</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Raw Points</div>
                          <div className="font-medium">{ctf.points}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Weighted Score</div>
                          <div className="font-medium">{formatScore(ctf.score)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Contribution</div>
                          <div className="font-medium">{ctf.contribution}%</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements">
            <Card>
              <CardHeader>
                <CardTitle>Achievements & Milestones</CardTitle>
                <CardDescription>Recognition for exceptional performance and participation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profileData.achievements.map((achievement) => (
                    <Card key={achievement.name} className="p-4 border-2 border-primary/20">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{achievement.icon}</div>
                        <div>
                          <h3 className="font-semibold text-primary">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest challenge solves and participation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profileData.recentActivity.map((activity, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${getCategoryColor(activity.category)}`} />
                          <div>
                            <h3 className="font-medium">{activity.challenge}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {activity.category}
                              </Badge>
                              <span>{activity.points} points</span>
                              {activity.isTeamSolve && (
                                <Badge variant="secondary" className="text-xs">
                                  Team solve with {activity.teammates.length} others
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
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
      </div>
    </div>
  )
}
