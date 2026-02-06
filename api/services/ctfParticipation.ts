import { solveModel } from "../../src/Database/connect";
import { cache } from "../utils/cache";

export interface CTFParticipationEntry {
  totalSolves: number;
  participantCount: number;
  firstSolve: Date | null;
  lastSolve: Date | null;
}

/**
 * Participation aggregation is expensive (unwind + group over solves).
 * Cache it for a short TTL to keep CTF list/rankings fast.
 */
export async function getCTFParticipationMap(
  ttlMs: number = 10 * 60 * 1000,
): Promise<Map<string, CTFParticipationEntry>> {
  const cacheKey = "ctf_participation_map_v1";
  const cached = cache.getCached<Map<string, CTFParticipationEntry>>(cacheKey);
  if (cached) return cached;

  const participationData = await solveModel.aggregate([
    { $unwind: "$users" },
    {
      $group: {
        _id: "$ctf_id",
        totalSolves: { $sum: 1 },
        uniqueParticipants: { $addToSet: "$users" },
        firstSolve: { $min: "$solved_at" },
        lastSolve: { $max: "$solved_at" },
      },
    },
    {
      $project: {
        ctf_id: "$_id",
        totalSolves: 1,
        participantCount: { $size: "$uniqueParticipants" },
        firstSolve: 1,
        lastSolve: 1,
      },
    },
  ]);

  const map = new Map<string, CTFParticipationEntry>();
  for (const row of participationData as any[]) {
    if (!row?.ctf_id) continue;
    map.set(String(row.ctf_id), {
      totalSolves: row.totalSolves ?? 0,
      participantCount: row.participantCount ?? 0,
      firstSolve: row.firstSolve ? new Date(row.firstSolve) : null,
      lastSolve: row.lastSolve ? new Date(row.lastSolve) : null,
    });
  }

  cache.set(cacheKey, map, ttlMs);
  return map;
}

