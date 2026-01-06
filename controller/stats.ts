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
 * Update player stats directly (for Stat Keeper)
 * POST /api/stats
 */
export async function updatePlayerStats(req: NextRequest) {
    try {
        await connectDB();

        // Verify user (Stat Keeper or Referee or Admin)
        const token = req.headers.get("authorization")?.split(" ")[1];
        if (!token) {
            return NextResponse.json({ error: "No token provided" }, { status: 401 });
        }
        verifyAccessToken(token); // Verify token validity

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

        // Find existing player stats or create new
        let playerStatEntry = teamData.playerStats.find((ps: any) =>
            ps.playerId.toString() === playerObjectId.toString()
        );

        // Ensure entry exists
        if (!playerStatEntry) {
            playerStatEntry = {
                playerId: playerObjectId,
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
                extraPoints: 0,
                defensiveTDs: 0,
                totalPoints: 0
            };
            teamData.playerStats.push(playerStatEntry);
        }

        // --- CUMULATIVE UPDATE LOGIC ---
        // Add new values to existing values instead of replacing them
        playerStatEntry.catches = (playerStatEntry.catches || 0) + (stats.catches || 0);
        playerStatEntry.catchYards = (playerStatEntry.catchYards || 0) + (stats.catchYards || 0);
        playerStatEntry.rushes = (playerStatEntry.rushes || 0) + (stats.rushes || 0);
        playerStatEntry.rushYards = (playerStatEntry.rushYards || 0) + (stats.rushYards || 0);
        playerStatEntry.passAttempts = (playerStatEntry.passAttempts || 0) + (stats.passAttempts || 0);
        playerStatEntry.passYards = (playerStatEntry.passYards || 0) + (stats.passYards || 0);
        playerStatEntry.completions = (playerStatEntry.completions || 0) + (stats.completions || 0);
        playerStatEntry.touchdowns = (playerStatEntry.touchdowns || 0) + (stats.touchdowns || 0);
        playerStatEntry.flagPull = (playerStatEntry.flagPull || 0) + (stats.flagPull || 0);
        playerStatEntry.sack = (playerStatEntry.sack || 0) + (stats.sack || 0);
        playerStatEntry.interceptions = (playerStatEntry.interceptions || 0) + (stats.interceptions || 0);
        playerStatEntry.safeties = (playerStatEntry.safeties || 0) + (stats.safeties || 0);
        playerStatEntry.extraPoints = (playerStatEntry.extraPoints || 0) + (stats.extraPoints || 0);
        playerStatEntry.defensiveTDs = (playerStatEntry.defensiveTDs || 0) + (stats.defensiveTDs || 0);

        // Recalculate total points for player
        playerStatEntry.totalPoints = (playerStatEntry.touchdowns || 0) * 6 +
            (playerStatEntry.defensiveTDs || 0) * 6 +
            (playerStatEntry.extraPoints || 0) * 1 +
            (playerStatEntry.safeties || 0) * 2;


        // --- RECALCULATE TEAM STATS ---
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
            extraPoints: 0,
            defensiveTDs: 0,
            totalPoints: 0
        };

        // Aggregate from all players
        for (const p of teamData.playerStats) {
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
            newTeamStats.extraPoints += p.extraPoints || 0;
            newTeamStats.defensiveTDs += p.defensiveTDs || 0;
            newTeamStats.totalPoints += p.totalPoints || 0;
        }

        teamData.teamStats = newTeamStats;

        // Mark modified
        (match as any).markModified(isTeamA ? "teamA.playerStats" : "teamB.playerStats");
        (match as any).markModified(isTeamA ? "teamA.teamStats" : "teamB.teamStats");

        await match.save();

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
