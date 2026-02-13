import Notification from "@/modules/notification";
import SuperAdmin from "@/modules/superadmin";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Match from "@/modules/match";
import User from "@/modules/user";
import Team from "@/modules/team";
import League from "@/modules/league";
import Leaderboard from "@/modules/leaderboard";
import { verifyAccessToken } from "@/lib/jwt";
import { updateLeaderboardFromMatch } from "./leaderboard";

/**
 * Helper to convert string ID to ObjectId
 */
function toObjectId(id: string): mongoose.Types.ObjectId {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid ID format");
    }
    return new mongoose.Types.ObjectId(id);
}

// ... existing code ...

/**
 * Submit stats for approval (sends notification to Super Admins)
 * POST /api/stats/submit
 */
export async function submitStats(req: NextRequest) {
    try {
        await connectDB();

        // Verify user
        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) return NextResponse.json({ error: "No token provided" }, { status: 401 });
        const decoded = verifyAccessToken(token);

        const body = await req.json() as any;
        const { matchId } = body;

        if (!matchId) return NextResponse.json({ error: "Match ID is required" }, { status: 400 });

        const match = await Match.findById(matchId)
            .populate([
                { path: "teamA.teamId", model: "Team" },
                { path: "teamB.teamId", model: "Team" }
            ]);

        if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

        // 1. Find Admins from User collection
        const userAdmins = await User.find({
            role: { $in: ["superadmin", "admin"] }
        });

        // 2. Find Admins from SuperAdmin collection
        const superAdmins = await SuperAdmin.find({});

        // Combine all unique IDs to notify
        const adminIds = new Set<string>();
        userAdmins.forEach(a => adminIds.add(a._id.toString()));
        superAdmins.forEach(a => adminIds.add(a._id.toString()));

        console.log(`🔍 [SUBMIT STATS] Found ${adminIds.size} unique admins to notify`);

        // Safely access team names
        const teamAName = (match as any).teamA?.teamId?.teamName || "Team A";
        const teamBName = (match as any).teamB?.teamId?.teamName || "Team B";

        // Create Notifications
        let notifiedCount = 0;
        for (const adminId of adminIds) {
            await Notification.create({
                sender: decoded.userId,
                receiver: new mongoose.Types.ObjectId(adminId),
                match: match._id,
                type: "STATS_SUBMITTED",
                status: "pending",
                message: `Stats for match ${teamAName} vs ${teamBName} have been submitted for approval.`
            });
            notifiedCount++;
        }

        return NextResponse.json(
            {
                message: "Stats submitted to Super Admins for approval",
                notifiedAdmins: notifiedCount,
                adminCount: adminIds.size
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Submit stats error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to submit stats" },
            { status: 500 }
        );
    }
}

/**
 * Update player stats directly (for Stat Keeper only)
 * POST /api/stats
 */
export async function updatePlayerStats(req: NextRequest) {
    try {
        await connectDB();

        // Verify user (Stat Keeper only)
        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) {
            return NextResponse.json({ error: "No token provided" }, { status: 401 });
        }
        const decoded = verifyAccessToken(token); // Verify token validity
        
        // Only Stat Keeper can update player stats
        if (decoded.role !== "stat-keeper") {
            return NextResponse.json({ error: "Only Stat Keeper can update player stats" }, { status: 403 });
        }

        const body = await req.json() as any;
        const { leagueId, matchId, teamId, playerId, stats } = body;

        if (!matchId || !teamId || !playerId || !stats) {
            return NextResponse.json(
                { error: "Match ID, Team ID, Player ID, and Stats are required" },
                { status: 400 }
            );
        }

        const matchObjectId = toObjectId(matchId);
        const teamObjectId = toObjectId(teamId);
        const playerObjectId = toObjectId(playerId);

        const match = await Match.findById(matchObjectId);
        if (!match) {
            return NextResponse.json({ error: "Match not found" }, { status: 404 });
        }

        // Determine which team
        const isTeamA = (match as any).teamA.teamId.toString() === teamObjectId.toString();
        const isTeamB = (match as any).teamB.teamId.toString() === teamObjectId.toString();

        if (!isTeamA && !isTeamB) {
            return NextResponse.json(
                { error: "Team not found in this match" },
                { status: 400 }
            );
        }

        const teamData = isTeamA ? (match as any).teamA : (match as any).teamB;
        if (!teamData) {
            return NextResponse.json({ error: "Team data not found for this match" }, { status: 400 });
        }
        // Ensure arrays/objects exist so we can persist reliably
        if (!Array.isArray(teamData.playerStats)) {
            teamData.playerStats = [];
        }

        // Find existing player stats index
        const playerStatsArray = teamData.playerStats;
        const existingIndex = playerStatsArray.findIndex((ps: any) =>
            ps && ps.playerId && String(ps.playerId) === String(playerObjectId)
        );

        let playerStatEntry: any;
        const isNewPlayerEntry = existingIndex === -1;

        if (existingIndex >= 0) {
            const existing = playerStatsArray[existingIndex];
            playerStatEntry = {
                playerId: existing.playerId,
                catches: (existing.catches || 0) + (stats.catches || 0),
                catchYards: (existing.catchYards || 0) + (stats.catchYards || 0),
                rushes: (existing.rushes || 0) + (stats.rushes || 0),
                rushYards: (existing.rushYards || 0) + (stats.rushYards || 0),
                passAttempts: (existing.passAttempts || 0) + (stats.passAttempts || 0),
                passYards: (existing.passYards || 0) + (stats.passYards || 0),
                completions: (existing.completions || 0) + (stats.completions || 0),
                touchdowns: (existing.touchdowns || 0) + (stats.touchdowns || 0),
                flagPull: (existing.flagPull || 0) + (stats.flagPull || 0),
                sack: (existing.sack || 0) + (stats.sack || 0),
                interceptions: (existing.interceptions || 0) + (stats.interceptions || 0),
                safeties: (existing.safeties || 0) + (stats.safeties || 0),
                conversionPoints: (existing.conversionPoints || 0) + (stats.conversionPoints || stats.extraPoints || 0)
            };
        } else {
            playerStatEntry = {
                playerId: playerObjectId,
                catches: stats.catches || 0,
                catchYards: stats.catchYards || 0,
                rushes: stats.rushes || 0,
                rushYards: stats.rushYards || 0,
                passAttempts: stats.passAttempts || 0,
                passYards: stats.passYards || 0,
                completions: stats.completions || 0,
                touchdowns: stats.touchdowns || 0,
                flagPull: stats.flagPull || 0,
                sack: stats.sack || 0,
                interceptions: stats.interceptions || 0,
                safeties: stats.safeties || 0,
                conversionPoints: stats.conversionPoints || stats.extraPoints || 0
            };
        }

        // Store old values for User.stats delta (before we replace the array)
        const oldEntry = existingIndex >= 0 ? playerStatsArray[existingIndex] : null;
        const oldCatches = oldEntry?.catches ?? 0;
        const oldCatchYards = oldEntry?.catchYards ?? 0;
        const oldRushes = oldEntry?.rushes ?? 0;
        const oldRushYards = oldEntry?.rushYards ?? 0;
        const oldPassAttempts = oldEntry?.passAttempts ?? 0;
        const oldPassYards = oldEntry?.passYards ?? 0;
        const oldCompletions = oldEntry?.completions ?? 0;
        const oldTouchdowns = oldEntry?.touchdowns ?? 0;
        const oldConversionPoints = oldEntry?.conversionPoints ?? 0;
        const oldSafeties = oldEntry?.safeties ?? 0;
        const oldFlagPull = oldEntry?.flagPull ?? 0;
        const oldSack = oldEntry?.sack ?? 0;
        const oldInterceptions = oldEntry?.interceptions ?? 0;
        const oldPlayerTotalPoints = (oldTouchdowns) * 6 + (oldConversionPoints) * 1 + (oldSafeties) * 2;

        // Build new playerStats array and set on match so Mongoose persists it
        const updatedPlayerStats =
            existingIndex >= 0
                ? playerStatsArray.map((p: any, i: number) => (i === existingIndex ? playerStatEntry : p))
                : [...playerStatsArray, playerStatEntry];

        const newPlayerTotalPoints = (playerStatEntry.touchdowns || 0) * 6 +
            (playerStatEntry.conversionPoints || 0) * 1 +
            (playerStatEntry.safeties || 0) * 2;

        // Recalculate team stats from the updated array
        const newTeamStats = {
            catches: 0,
            catchYards: 0,
            rushes: 0,
            rushYards: 0,
            passAttempts: 0,
            passYards: 0,
            completions: 0,
            touchdowns: 0,
            flagPull: 0,
            sack: 0,
            interceptions: 0,
            safeties: 0,
            conversionPoints: 0
        };
        for (const p of updatedPlayerStats) {
            if (!p) continue;
            newTeamStats.catches += p.catches || 0;
            newTeamStats.catchYards += p.catchYards || 0;
            newTeamStats.rushes += p.rushes || 0;
            newTeamStats.rushYards += p.rushYards || 0;
            newTeamStats.passAttempts += p.passAttempts || 0;
            newTeamStats.passYards += p.passYards || 0;
            newTeamStats.completions += p.completions || 0;
            newTeamStats.touchdowns += p.touchdowns || 0;
            newTeamStats.flagPull += p.flagPull || 0;
            newTeamStats.sack += p.sack || 0;
            newTeamStats.interceptions += p.interceptions || 0;
            newTeamStats.safeties += p.safeties || 0;
            newTeamStats.conversionPoints += p.conversionPoints || (p as any).extraPoints || 0;
        }

        // Step 1: Write to match document using set() so Mongoose persists; then save match first
        const teamPath = isTeamA ? "teamA" : "teamB";
        (match as any).set(`${teamPath}.playerStats`, updatedPlayerStats);
        (match as any).set(`${teamPath}.teamStats`, newTeamStats);
        (match as any).markModified(teamPath);
        await match.save();

        // Calculate deltas for all stat fields
        const statDeltas = {
            catches: (playerStatEntry.catches || 0) - oldCatches,
            catchYards: (playerStatEntry.catchYards || 0) - oldCatchYards,
            rushes: (playerStatEntry.rushes || 0) - oldRushes,
            rushYards: (playerStatEntry.rushYards || 0) - oldRushYards,
            passAttempts: (playerStatEntry.passAttempts || 0) - oldPassAttempts,
            passYards: (playerStatEntry.passYards || 0) - oldPassYards,
            completions: (playerStatEntry.completions || 0) - oldCompletions,
            touchdowns: (playerStatEntry.touchdowns || 0) - oldTouchdowns,
            conversionPoints: (playerStatEntry.conversionPoints || 0) - oldConversionPoints,
            safeties: (playerStatEntry.safeties || 0) - oldSafeties,
            flagPull: (playerStatEntry.flagPull || 0) - oldFlagPull,
            sack: (playerStatEntry.sack || 0) - oldSack,
            interceptions: (playerStatEntry.interceptions || 0) - oldInterceptions,
        };

        const pointsDelta = newPlayerTotalPoints - oldPlayerTotalPoints;

        // Step 2: Only after match is saved, update User.stats from the same data (career totals)
        if (pointsDelta !== 0 || isNewPlayerEntry || Object.values(statDeltas).some(d => d !== 0)) {
            const updatePayload: any = {
                $inc: {
                    totalPoints: pointsDelta
                }
            };

            if (statDeltas.catches !== 0) updatePayload.$inc['stats.catches'] = statDeltas.catches;
            if (statDeltas.catchYards !== 0) updatePayload.$inc['stats.catchYards'] = statDeltas.catchYards;
            if (statDeltas.rushes !== 0) updatePayload.$inc['stats.rushes'] = statDeltas.rushes;
            if (statDeltas.rushYards !== 0) updatePayload.$inc['stats.rushYards'] = statDeltas.rushYards;
            if (statDeltas.passAttempts !== 0) updatePayload.$inc['stats.passAttempts'] = statDeltas.passAttempts;
            if (statDeltas.passYards !== 0) updatePayload.$inc['stats.passYards'] = statDeltas.passYards;
            if (statDeltas.completions !== 0) updatePayload.$inc['stats.completions'] = statDeltas.completions;
            if (statDeltas.touchdowns !== 0) updatePayload.$inc['stats.touchdowns'] = statDeltas.touchdowns;
            if (statDeltas.conversionPoints !== 0) updatePayload.$inc['stats.conversionPoints'] = statDeltas.conversionPoints;
            if (statDeltas.safeties !== 0) updatePayload.$inc['stats.safeties'] = statDeltas.safeties;
            if (statDeltas.flagPull !== 0) updatePayload.$inc['stats.flagPull'] = statDeltas.flagPull;
            if (statDeltas.sack !== 0) updatePayload.$inc['stats.sack'] = statDeltas.sack;
            if (statDeltas.interceptions !== 0) updatePayload.$inc['stats.interceptions'] = statDeltas.interceptions;
            if (pointsDelta !== 0) updatePayload.$inc['stats.totalPoints'] = pointsDelta;
            if (isNewPlayerEntry) updatePayload.$inc['stats.matchesPlayed'] = 1;
            // First time this player has stats in this league → increment leaguesPlayed
            if (isNewPlayerEntry && (match as any).leagueId) {
                const leagueId = (match as any).leagueId;
                const count = await Match.countDocuments({
                    leagueId,
                    $or: [
                        { "teamA.playerStats.playerId": playerObjectId },
                        { "teamB.playerStats.playerId": playerObjectId }
                    ]
                });
                if (count === 1) updatePayload.$inc['stats.leaguesPlayed'] = 1;
            }
            updatePayload.$set = { 'stats.lastUpdated': new Date() };

            await User.findByIdAndUpdate(playerObjectId, updatePayload);
        }

        // Step 3: Update Team overall stats (cumulative across all matches), same as User.stats
        const teamInc: Record<string, number> = {};
        if (statDeltas.catches !== 0) teamInc['stats.catches'] = statDeltas.catches;
        if (statDeltas.catchYards !== 0) teamInc['stats.catchYards'] = statDeltas.catchYards;
        if (statDeltas.rushes !== 0) teamInc['stats.rushes'] = statDeltas.rushes;
        if (statDeltas.rushYards !== 0) teamInc['stats.rushYards'] = statDeltas.rushYards;
        if (statDeltas.passAttempts !== 0) teamInc['stats.passAttempts'] = statDeltas.passAttempts;
        if (statDeltas.passYards !== 0) teamInc['stats.passYards'] = statDeltas.passYards;
        if (statDeltas.completions !== 0) teamInc['stats.completions'] = statDeltas.completions;
        if (statDeltas.touchdowns !== 0) teamInc['stats.touchdowns'] = statDeltas.touchdowns;
        if (statDeltas.conversionPoints !== 0) teamInc['stats.conversionPoints'] = statDeltas.conversionPoints;
        if (statDeltas.safeties !== 0) teamInc['stats.safeties'] = statDeltas.safeties;
        if (statDeltas.flagPull !== 0) teamInc['stats.flagPull'] = statDeltas.flagPull;
        if (statDeltas.sack !== 0) teamInc['stats.sack'] = statDeltas.sack;
        if (statDeltas.interceptions !== 0) teamInc['stats.interceptions'] = statDeltas.interceptions;
        if (pointsDelta !== 0) teamInc['stats.totalPoints'] = pointsDelta;
        const isFirstPlayerForTeamInThisMatch = isNewPlayerEntry && updatedPlayerStats.length === 1;
        if (isFirstPlayerForTeamInThisMatch) teamInc['stats.matchesPlayed'] = 1;
        if (isNewPlayerEntry && (match as any).leagueId) {
            const leagueId = (match as any).leagueId;
            const teamMatchCount = await Match.countDocuments({
                leagueId,
                $or: [
                    { "teamA.teamId": teamObjectId },
                    { "teamB.teamId": teamObjectId }
                ]
            });
            if (teamMatchCount === 1) teamInc['stats.leaguesPlayed'] = 1;
        }
        if (Object.keys(teamInc).length > 0) {
            const teamPayload: any = { $inc: teamInc, $set: { 'stats.lastUpdated': new Date() } };
            await Team.findByIdAndUpdate(teamObjectId, teamPayload);
        }

        return NextResponse.json(
            {
                message: "Stats updated successfully",
                data: match
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Update stats error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update stats" },
            { status: 500 }
        );
    }
}

/**
 * Get stats for a match (for Stat Keeper)
 * GET /api/stats
 */
export async function getMatchStats(req: NextRequest) {
    try {
        await connectDB();

        // Verify user
        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) {
            return NextResponse.json({ error: "No token provided" }, { status: 401 });
        }
        verifyAccessToken(token);

        const { searchParams } = new URL(req.url);
        const matchId = searchParams.get("matchId");

        if (!matchId) {
            return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
        }

        const match = await Match.findById(toObjectId(matchId))
            .populate("teamA.playerStats.playerId", "firstName lastName email")
            .populate("teamB.playerStats.playerId", "firstName lastName email")
            .lean();

        if (!match) {
            return NextResponse.json({ error: "Match not found" }, { status: 404 });
        }

        return NextResponse.json(
            {
                message: "Stats retrieved successfully",
                data: [] // Return empty list to prevent "ghost" items in Draft tab. Real stats are in /api/match/:id
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Get stats error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get stats" },
            { status: 500 }
        );
    }
}

/**
 * Approve stats for a match
 * POST /api/stats/approve
 */
export async function approveStats(req: NextRequest) {
    try {
        await connectDB();

        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) return NextResponse.json({ error: "No token provided" }, { status: 401 });
        const decoded = verifyAccessToken(token);

        if (decoded.role !== "superadmin") {
            return NextResponse.json({ error: "Only superadmins can approve stats" }, { status: 403 });
        }

        const body = await req.json() as any;
        let { matchId, notificationId } = body;

        if (!matchId && !notificationId) {
            return NextResponse.json({ error: "Either Match ID or Notification ID is required" }, { status: 400 });
        }

        // If matchId is missing but notificationId is present, find the match from the notification
        if (!matchId && notificationId) {
            const notification = await Notification.findById(notificationId);
            if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
            matchId = notification.match;
        }

        if (!matchId) return NextResponse.json({ error: "Match ID is required" }, { status: 400 });

        const match = await Match.findById(matchId)
            .populate([
                { path: "teamA.teamId", model: "Team" },
                { path: "teamB.teamId", model: "Team" }
            ]);

        if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

        // Calculate winner based on scores
        const teamAScore = (match as any).teamA.score || 0;
        const teamBScore = (match as any).teamB.score || 0;
        const teamATeamId = (match as any).teamA.teamId._id || (match as any).teamA.teamId;
        const teamBTeamId = (match as any).teamB.teamId._id || (match as any).teamB.teamId;

        if (teamAScore > teamBScore) {
            (match as any).gameWinnerTeam = teamATeamId;
            (match as any).teamA.win = true;
            (match as any).teamB.win = false;
        } else if (teamBScore > teamAScore) {
            (match as any).gameWinnerTeam = teamBTeamId;
            (match as any).teamA.win = false;
            (match as any).teamB.win = true;
        } else {
            (match as any).gameWinnerTeam = null;
            (match as any).teamA.win = null;
            (match as any).teamB.win = null;
        }

        // Mark as modified
        (match as any).markModified("teamA.win");
        (match as any).markModified("teamB.win");

        // Update match status
        match.status = "completed";
        await match.save();

        // Update leaderboard
        await updateLeaderboardFromMatch(matchId);

        // Update notification status
        if (notificationId) {
            const notification = await Notification.findById(notificationId);
            if (notification) {
                notification.status = "accepted";
                await notification.save();

                // Notify original sender
                const teamAName = (match as any).teamA?.teamId?.teamName || "Team A";
                const teamBName = (match as any).teamB?.teamId?.teamName || "Team B";

                await Notification.create({
                    sender: decoded.userId,
                    receiver: notification.sender,
                    match: match._id,
                    type: "STATS_APPROVED",
                    status: "accepted",
                    message: `Stats for match ${teamAName} vs ${teamBName} have been approved.`
                });
            }
        }

        return NextResponse.json({ success: true, message: "Stats approved successfully" }, { status: 200 });

    } catch (error: any) {
        console.error("Approve stats error:", error);
        return NextResponse.json({ error: error.message || "Failed to approve stats" }, { status: 500 });
    }
}

/**
 * Send stats back for correction
 * POST /api/stats/reject
 */
export async function sendBackStats(req: NextRequest) {
    try {
        await connectDB();

        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) return NextResponse.json({ error: "No token provided" }, { status: 401 });
        const decoded = verifyAccessToken(token);

        if (decoded.role !== "superadmin") {
            return NextResponse.json({ error: "Only superadmins can reject stats" }, { status: 403 });
        }

        const body = await req.json() as any;
        let { matchId, notificationId, reason } = body;

        if (!matchId && !notificationId) {
            return NextResponse.json({ error: "Either Match ID or Notification ID is required" }, { status: 400 });
        }

        // If matchId is missing but notificationId is present, find the match from the notification
        if (!matchId && notificationId) {
            const notification = await Notification.findById(notificationId);
            if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
            matchId = notification.match;
        }

        if (!matchId) return NextResponse.json({ error: "Match ID is required" }, { status: 400 });

        const match = await Match.findById(matchId);
        if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

        // Update notification
        if (notificationId) {
            const notification = await Notification.findById(notificationId);
            if (notification) {
                notification.status = "rejected";
                await notification.save();

                // Notify original sender
                await Notification.create({
                    sender: decoded.userId,
                    receiver: notification.sender,
                    match: match._id,
                    type: "STATS_REJECTED",
                    status: "pending",
                    message: `Stats for match have been sent back${reason ? ': ' + reason : '.'} Please check and resubmit.`
                });
            }
        }

        return NextResponse.json({ success: true, message: "Stats sent back for correction" }, { status: 200 });

    } catch (error: any) {
        console.error("Send back stats error:", error);
        return NextResponse.json({ error: error.message || "Failed to send back stats" }, { status: 500 });
    }
}
