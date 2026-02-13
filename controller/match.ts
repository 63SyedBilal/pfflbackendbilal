import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Match from "@/modules/match";
import League, { LeagueSchema } from "@/modules/league";
import Team, { TeamSchema } from "@/modules/team";
import Notification from "@/modules/notification";
import Leaderboard from "@/modules/leaderboard";
import User, { UserSchema } from "@/modules/user";
import { verifyAccessToken } from "@/lib/jwt";
import { updateLeaderboardFromMatch } from "./leaderboard";

// Failsafe to ensure models are registered
function ensureModelsRegistered() {
  if (!mongoose.models.User && UserSchema) {
    console.log("⚠️ User model missing in mongoose.models, re-registering...");
    mongoose.model("User", UserSchema);
  }
  if (!mongoose.models.Team && TeamSchema) {
    console.log("⚠️ Team model missing in mongoose.models, re-registering...");
    mongoose.model("Team", TeamSchema);
  }
  if (!mongoose.models.League && LeagueSchema) {
    console.log("⚠️ League model missing in mongoose.models, re-registering...");
    mongoose.model("League", LeagueSchema);
  }
}

// Helper to get token from request
function getToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

// Helper to verify user from token
async function verifyUser(req: NextRequest) {
  const token = getToken(req);
  if (!token) throw new Error("No token provided");

  const decoded = verifyAccessToken(token);
  return decoded;
}

/**
 * Helper to convert string ID to ObjectId
 */
function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ID format");
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Create a new match
 * POST /api/match
 */
export async function createMatch(req: NextRequest) {
  try {
    await connectDB();

    const decoded = await verifyUser(req);

    // Get user ID from token (superadmin who creates the match)
    const userId = (decoded as any).id || (decoded as any)._id || (decoded as any).userId;
    if (!userId) {
      return NextResponse.json(
        { error: "User ID not found in token" },
        { status: 401 }
      );
    }

    const body: any = await req.json();
    const {
      leagueId,
      teamA,
      teamB,
      format,
      gameDate,
      gameTime,
      venue,
      refereeId,
      statKeeperId,
      roundName,
      gameNumber,
      status,
      teamAInitialSide,
      teamBInitialSide,
    } = body;

    // Validate required fields
    if (!leagueId || !teamA || !teamB || !gameDate || !gameTime || !format) {
      return NextResponse.json(
        { error: "League ID, Team A, Team B, Game Date, Game Time, and Format are required" },
        { status: 400 }
      );
    }

    // Validate format
    if (!["5v5", "7v7"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be either '5v5' or '7v7'" },
        { status: 400 }
      );
    }

    // Extract teamId from teamA and teamB (support both object and string formats)
    const teamAId = typeof teamA === 'string' ? teamA : (teamA?.teamId || teamA);
    const teamBId = typeof teamB === 'string' ? teamB : (teamB?.teamId || teamB);

    // Validate team IDs exist
    if (!teamAId || !teamBId) {
      return NextResponse.json(
        { error: "Team A and Team B must have valid teamId" },
        { status: 400 }
      );
    }

    // Convert IDs to ObjectId format
    let leagueObjectId: mongoose.Types.ObjectId;
    let teamAObjectId: mongoose.Types.ObjectId;
    let teamBObjectId: mongoose.Types.ObjectId;
    let createdByObjectId: mongoose.Types.ObjectId;

    try {
      leagueObjectId = toObjectId(leagueId);
      teamAObjectId = toObjectId(teamAId);
      teamBObjectId = toObjectId(teamBId);
      createdByObjectId = toObjectId(userId);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Invalid ID format: ${error.message}` },
        { status: 400 }
      );
    }

    // Verify league exists and get date range
    const league = await League.findById(leagueObjectId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Validate game date is within league date range
    const gameDateObj = new Date(gameDate);
    const leagueStart = new Date((league as any).startDate);
    const leagueEnd = new Date((league as any).endDate);

    if (gameDateObj < leagueStart || gameDateObj > leagueEnd) {
      return NextResponse.json(
        { error: "Game date must be within the league date range" },
        { status: 400 }
      );
    }

    // Validate status enum - only allow "upcoming" when creating a match
    if (status && status !== "upcoming") {
      return NextResponse.json(
        { error: "Status must be 'upcoming' when creating a match. Game will start automatically when first action is added." },
        { status: 400 }
      );
    }

    // Validate initial sides
    const validSides = ["offense", "defense"];
    const teamASide = teamAInitialSide || "offense";
    const teamBSide = teamBInitialSide || "defense";

    if (!validSides.includes(teamASide) || !validSides.includes(teamBSide)) {
      return NextResponse.json(
        { error: "Initial side must be either 'offense' or 'defense'" },
        { status: 400 }
      );
    }

    // SECURITY: Block any attempt to set playerStats/teamStats on creation
    // Stats can ONLY be set via POST /api/stats by stat-keeper role
    if ((typeof teamA === 'object' && (teamA.playerStats !== undefined || teamA.teamStats !== undefined)) ||
        (typeof teamB === 'object' && (teamB.playerStats !== undefined || teamB.teamStats !== undefined))) {
      return NextResponse.json(
        { 
          error: "Cannot set playerStats or teamStats on match creation. Use POST /api/stats endpoint (stat-keeper role only)" 
        },
        { status: 403 }
      );
    }

    // Build team match data
    // Support both object format (with players, playerActions, etc.) and simple format
    const teamAData: any = {
      teamId: teamAObjectId,
      side: teamASide,
      players: (typeof teamA === 'object' && teamA.players) ? teamA.players : [],
      playerActions: (typeof teamA === 'object' && teamA.playerActions) ? teamA.playerActions : [],
      playerStats: [],  // Always init empty; populated only via POST /api/stats
      teamStats: {},    // Always init empty; auto-calculated by stat keeper
      score: 0,         // Always start with 0
      result: null
    };

    const teamBData: any = {
      teamId: teamBObjectId,
      side: teamBSide,
      players: (typeof teamB === 'object' && teamB.players) ? teamB.players : [],
      playerActions: (typeof teamB === 'object' && teamB.playerActions) ? teamB.playerActions : [],
      playerStats: [],  // Always init empty; populated only via POST /api/stats
      teamStats: {},    // Always init empty; auto-calculated by stat keeper
      score: 0,         // Always start with 0
      result: null
    };

    const matchData: any = {
      leagueId: leagueObjectId,
      createdBy: createdByObjectId,
      format: format,
      gameDate: gameDateObj,
      gameTime: gameTime.trim(),
      venue: venue || "",
      roundName: roundName || "Group Stage",
      gameNumber: gameNumber || "",
      status: status || "upcoming",
      teamA: teamAData,
      teamB: teamBData,
    };

    // Add optional referee and stat keeper
    if (refereeId) {
      matchData.refereeId = toObjectId(refereeId);
    }

    if (statKeeperId) {
      matchData.statKeeperId = toObjectId(statKeeperId);
    }

    const match = new Match(matchData);
    await match.save();

    // Get sender ID from token (admin who created the match)
    const senderId = toObjectId(decoded.userId);
    const matchObjectId = (match as any)._id;

    // Create notifications for assigned referee and stat keeper
    const notifications = [];

    // Create notification for referee if assigned
    if (refereeId) {
      try {
        const refereeObjectId = toObjectId(refereeId);
        const refereeNotification = await Notification.create({
          sender: senderId,
          receiver: refereeObjectId,
          league: leagueObjectId,
          match: matchObjectId,
          type: "GAME_ASSIGNED",
          status: "pending"
        });
        notifications.push(refereeNotification);
        console.log("✅ Notification created for referee:", {
          notificationId: refereeNotification._id.toString(),
          refereeId: refereeId,
          matchId: matchObjectId.toString()
        });
      } catch (error: any) {
        console.error("❌ Error creating notification for referee:", error);
        // Don't fail match creation if notification fails
      }
    }

    // Create notification for stat keeper if assigned
    if (statKeeperId) {
      try {
        const statKeeperObjectId = toObjectId(statKeeperId);
        const statKeeperNotification = await Notification.create({
          sender: senderId,
          receiver: statKeeperObjectId,
          league: leagueObjectId,
          match: matchObjectId,
          type: "GAME_ASSIGNED",
          status: "pending"
        });
        notifications.push(statKeeperNotification);
        console.log("✅ Notification created for stat keeper:", {
          notificationId: statKeeperNotification._id.toString(),
          statKeeperId: statKeeperId,
          matchId: matchObjectId.toString()
        });
      } catch (error: any) {
        console.error("❌ Error creating notification for stat keeper:", error);
        // Don't fail match creation if notification fails
      }
    }

    // Populate references
    await match.populate("leagueId", "leagueName format startDate endDate");
    await match.populate("createdBy", "firstName lastName email role");
    await match.populate("teamA.teamId", "teamName enterCode");
    await match.populate("teamB.teamId", "teamName enterCode");
    if (match.refereeId) {
      await match.populate("refereeId", "firstName lastName email");
    }
    if (match.statKeeperId) {
      await match.populate("statKeeperId", "firstName lastName email");
    }
    if (match.gameWinnerTeam) {
      await match.populate("gameWinnerTeam", "teamName enterCode");
    }

    // Convert to plain object
    const matchObj = match.toObject();

    return NextResponse.json(
      {
        message: "Match created successfully",
        data: matchObj,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create match error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to create match" },
      { status: 500 }
    );
  }
}

/**
 * Get all matches (with optional filters)
 * GET /api/match?leagueId=:id&status=upcoming
 */


export async function getAllMatches(req: NextRequest) {
  try {
    console.log("🔵 getAllMatches called");
    await connectDB();
    console.log("✅ Database connected");

    // Verify the user
    try {
      await verifyUser(req);
      console.log("✅ User verified");
    } catch (authError: any) {
      console.error("❌ Auth error:", authError);
      return NextResponse.json({ error: authError.message || "Authentication failed" }, { status: 401 });
    }

    // Extract query params
    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get("leagueId");
    const status = searchParams.get("status");
    const statKeeperId = searchParams.get("statKeeperId");
    const refereeId = searchParams.get("refereeId");

    let query: any = {};

    if (leagueId) {
      try {
        query.leagueId = toObjectId(leagueId);
      } catch (e: any) {
        console.error("❌ Invalid leagueId:", e);
        return NextResponse.json({ error: "Invalid league ID format" }, { status: 400 });
      }
    }

    if (statKeeperId) {
      try {
        query.statKeeperId = toObjectId(statKeeperId);
      } catch (e: any) {
        console.error("❌ Invalid statKeeperId:", e);
      }
    }

    if (refereeId) {
      try {
        query.refereeId = toObjectId(refereeId);
      } catch (e: any) {
        console.error("❌ Invalid refereeId:", e);
      }
    }

    if (status) {
      if (!["upcoming", "continue", "completed"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter. Must be: upcoming, continue, or completed" }, { status: 400 });
      }
      query.status = status;
    }

    console.log("🔍 Query:", JSON.stringify(query));

    // Fetch matches from database
    console.log("🔍 Fetching matches from database...");
    let matches: any[] = [];

    try {
      matches = await Match.find(query)
        .populate("leagueId", "leagueName format startDate endDate logo")
        .populate("createdBy", "firstName lastName email role")
        .populate("teamA.teamId", "teamName enterCode image")
        .populate("teamB.teamId", "teamName enterCode image")
        .populate("teamA.attendance.playerId", "firstName lastName email")
        .populate("teamB.attendance.playerId", "firstName lastName email")
        .populate("refereeId", "firstName lastName email role")
        .populate("statKeeperId", "firstName lastName email role")
        .populate("gameWinnerTeam", "teamName enterCode")
        .sort({ gameDate: 1, gameTime: 1 })
        .lean()
        .exec();

      console.log(`✅ Found ${matches.length} matches`);
    } catch (populateError: any) {
      console.error("❌ Error in populate:", populateError);
      console.log("🔄 Retrying without populate...");
      matches = await Match.find(query)
        .sort({ gameDate: 1, gameTime: 1 })
        .lean()
        .exec();
      console.log(`✅ Found ${matches.length} matches (without populate)`);
    }

    // Return matches
    return NextResponse.json(
      {
        message: "Matches retrieved successfully",
        data: matches,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("❌ Get matches error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to get matches",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}


/**
 * Get match by ID
 * GET /api/match/:id
 */
export async function getMatch(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    const match = await Match.findById(matchId)
      .populate("leagueId", "leagueName format startDate endDate logo")
      .populate("createdBy", "firstName lastName email role")
      .populate("teamA.teamId", "teamName enterCode")
      .populate("teamB.teamId", "teamName enterCode")
      .populate("teamA.players.playerId", "firstName lastName email profileImage position")
      .populate("teamB.players.playerId", "firstName lastName email profileImage position")
      .populate("teamA.playerStats.playerId", "firstName lastName email profileImage position")
      .populate("teamB.playerStats.playerId", "firstName lastName email profileImage position")
      .populate("teamA.playerActions.playerId", "firstName lastName email")
      .populate("teamB.playerActions.playerId", "firstName lastName email")
      .populate("refereeId", "firstName lastName email role")
      .populate("statKeeperId", "firstName lastName email role")
      .populate("gameWinnerTeam", "teamName enterCode")
      .lean()
      .exec();

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // --- MIGRATION: Backfill actions for legacy matches ---
    // If actions array is empty but we have legacy playerActions, migrate them.
    if ((!(match as any).actions || (match as any).actions.length === 0) &&
      ((match as any).teamA?.playerActions?.length > 0 || (match as any).teamB?.playerActions?.length > 0)) {

      console.log(`[MIGRATION] Backfilling actions for match ${matchId}`);
      const migratedActions = [];

      // Migrate Team A
      if ((match as any).teamA?.playerActions) {
        for (const action of (match as any).teamA.playerActions) {
          migratedActions.push({
            type: "score",
            teamId: (match as any).teamA.teamId._id || (match as any).teamA.teamId,
            playerId: action.playerId._id || action.playerId,
            actionType: action.actionType,
            // Retrieve name/pos from populated data if available, else generic
            playerName: action.playerId.firstName ? `${action.playerId.firstName} ${action.playerId.lastName}` : "Unknown Player",
            position: action.playerId.position || "",
            timestamp: action.timestamp
          });
        }
      }

      // Migrate Team B
      if ((match as any).teamB?.playerActions) {
        for (const action of (match as any).teamB.playerActions) {
          migratedActions.push({
            type: "score",
            teamId: (match as any).teamB.teamId._id || (match as any).teamB.teamId,
            playerId: action.playerId._id || action.playerId,
            actionType: action.actionType,
            playerName: action.playerId.firstName ? `${action.playerId.firstName} ${action.playerId.lastName}` : "Unknown Player",
            position: action.playerId.position || "",
            timestamp: action.timestamp
          });
        }
      }

      // Sort chronological
      migratedActions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Save to DB (using updateOne to avoid full validation issues)
      await Match.updateOne({ _id: matchId }, { $set: { actions: migratedActions } });

      // Update the local match object to return
      (match as any).actions = migratedActions;
    }
    // -----------------------------------------------------

    return NextResponse.json(
      {
        message: "Match retrieved successfully",
        data: match,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get match error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to get match" },
      { status: 500 }
    );
  }
}

/**
 * Update match
 * PUT /api/match/:id
 * NOTE: playerStats and teamStats can ONLY be updated via /api/stats endpoint by stat-keeper role
 */
export async function updateMatch(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const decoded = await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    const match = await Match.findById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const {
      format,
      gameDate,
      gameTime,
      venue,
      refereeId,
      statKeeperId,
      roundName,
      gameNumber,
      status,
      teamA,
      teamB,
      gameWinnerTeam,
      timesSwitched,
      completedAt,
    } = await req.json() as any;

    // SECURITY: Block direct playerStats/teamStats updates via this endpoint
    // These fields can ONLY be updated via /api/stats by stat-keeper role
    if ((teamA?.playerStats !== undefined) || (teamA?.teamStats !== undefined) ||
        (teamB?.playerStats !== undefined) || (teamB?.teamStats !== undefined)) {
      return NextResponse.json(
        { 
          error: "Cannot update playerStats or teamStats via this endpoint. Use POST /api/stats endpoint (stat-keeper role only)" 
        },
        { status: 403 }
      );
    }

    // Get league to validate date range
    const league = await League.findById((match as any).leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Update fields
    if (format !== undefined) {
      if (!["5v5", "7v7"].includes(format)) {
        return NextResponse.json(
          { error: "Format must be either '5v5' or '7v7'" },
          { status: 400 }
        );
      }
      (match as any).format = format;
    }

    if (gameDate !== undefined) {
      const gameDateObj = new Date(gameDate);
      const leagueStart = new Date((league as any).startDate);
      const leagueEnd = new Date((league as any).endDate);

      if (gameDateObj < leagueStart || gameDateObj > leagueEnd) {
        return NextResponse.json(
          { error: "Game date must be within the league date range" },
          { status: 400 }
        );
      }
      (match as any).gameDate = gameDateObj;
    }

    if (gameTime !== undefined) {
      (match as any).gameTime = gameTime.trim();
    }

    if (venue !== undefined) {
      (match as any).venue = venue;
    }

    if (refereeId !== undefined) {
      (match as any).refereeId = refereeId ? toObjectId(refereeId) : null;
    }

    if (statKeeperId !== undefined) {
      (match as any).statKeeperId = statKeeperId ? toObjectId(statKeeperId) : null;
    }

    if (roundName !== undefined) {
      (match as any).roundName = roundName;
    }

    if (gameNumber !== undefined) {
      (match as any).gameNumber = gameNumber;
    }

    // Only allow status to be set to "completed" via updateMatch
    // Status changes to "continue" automatically when first action is added
    if (status !== undefined) {
      if (status !== "completed") {
        return NextResponse.json(
          { error: "Status can only be set to 'completed' via this endpoint. Use game actions to start the game." },
          { status: 400 }
        );
      }
      const wasAlreadyCompleted = (match as any).status === "completed";
      (match as any).status = "completed";

      // Set completedAt when status is completed
      if (!(match as any).completedAt) {
        (match as any).completedAt = new Date();
      }

      // Add Game Complete milestone to timeline
      if (!(match as any).actions) {
        (match as any).actions = [];
      }
      (match as any).actions.push({
        type: "gamecomplete",
        actionType: "Game Complete",
        timestamp: new Date()
      });
      (match as any).markModified("actions"); // Ensure it's saved

      // Calculate winner based on scores
      const teamAScore = (match as any).teamA.score || 0;
      const teamBScore = (match as any).teamB.score || 0;
      const teamATeamId = (match as any).teamA.teamId;
      const teamBTeamId = (match as any).teamB.teamId;

      if (teamAScore > teamBScore) {
        // Team A wins
        (match as any).gameWinnerTeam = teamATeamId;
        (match as any).teamA.win = true;
        (match as any).teamB.win = false;
      } else if (teamBScore > teamAScore) {
        // Team B wins
        (match as any).gameWinnerTeam = teamBTeamId;
        (match as any).teamA.win = false;
        (match as any).teamB.win = true;
      } else {
        // Tie game
        (match as any).gameWinnerTeam = null;
        (match as any).teamA.win = null;
        (match as any).teamB.win = null;
      }

      // Mark as modified to ensure changes are saved
      (match as any).markModified("teamA.win");
      (match as any).markModified("teamB.win");

      // Update leaderboard when match is completed
      try {
        await updateLeaderboardFromMatch(matchId);
      } catch (leaderboardError: any) {
        console.error("Error updating leaderboard from match:", leaderboardError);
        // Don't fail match update if leaderboard update fails
      }

      // Update User.stats and Team.stats: gamesWon5v5 / gamesWon7v7 for winning team (only on first completion)
      if (!wasAlreadyCompleted && (match as any).teamA.win !== null && (match as any).teamB.win !== null) {
        const formatStr = String((match as any).format || "").trim().toLowerCase();
        const is5v5 = formatStr === "5v5";
        const gameWonField = is5v5 ? "stats.gamesWon5v5" : "stats.gamesWon7v7";
        const winningTeamId = (match as any).gameWinnerTeam;
        const winningTeam = (match as any).teamA.win === true ? (match as any).teamA : (match as any).teamB;
        const players = winningTeam.players || [];
        const updatePayload = { $inc: { [gameWonField]: 1 }, $set: { "stats.lastUpdated": new Date() } };
        try {
          for (const p of players) {
            const pid = p.playerId || p;
            if (!pid) continue;
            const userId = pid instanceof mongoose.Types.ObjectId ? pid : new mongoose.Types.ObjectId(String(pid));
            await User.updateOne({ _id: userId }, updatePayload);
          }
          if (winningTeamId) {
            const teamId = winningTeamId instanceof mongoose.Types.ObjectId ? winningTeamId : new mongoose.Types.ObjectId(String(winningTeamId));
            await Team.updateOne({ _id: teamId }, updatePayload);
          }
        } catch (userUpdateErr: any) {
          console.error("Error updating user/team games won:", userUpdateErr);
        }
      }
    }

    if (gameWinnerTeam !== undefined) {
      (match as any).gameWinnerTeam = gameWinnerTeam ? toObjectId(gameWinnerTeam) : null;
    }

    if (timesSwitched !== undefined) {
      if (timesSwitched !== null && !["halfTime", "fullTime", "overtime"].includes(timesSwitched)) {
        return NextResponse.json(
          { error: "timesSwitched must be 'halfTime', 'fullTime', 'overtime', or null" },
          { status: 400 }
        );
      }
      (match as any).timesSwitched = timesSwitched;
    }

    if (completedAt !== undefined) {
      (match as any).completedAt = completedAt ? new Date(completedAt) : null;
    }

    // Update team data if provided
    if (teamA !== undefined) {
      if (typeof teamA === 'object') {
        // Update teamA fields
        if (teamA.teamId !== undefined) {
          (match as any).teamA.teamId = toObjectId(teamA.teamId);
        }
        if (teamA.side !== undefined) {
          if (!["offense", "defense"].includes(teamA.side)) {
            return NextResponse.json(
              { error: "Side must be either 'offense' or 'defense'" },
              { status: 400 }
            );
          }
          (match as any).teamA.side = teamA.side;
        }
        if (teamA.players !== undefined) {
          (match as any).teamA.players = teamA.players.map((p: any) => ({
            playerId: toObjectId(p.playerId),
            isActive: p.isActive !== undefined ? p.isActive : false
          }));
        }
        if (teamA.score !== undefined) {
          (match as any).teamA.score = teamA.score;
        }
        if (teamA.win !== undefined) {
          if (teamA.win !== null && typeof teamA.win !== "boolean") {
            return NextResponse.json(
              { error: "Win must be a boolean (true for win, false for loss) or null" },
              { status: 400 }
            );
          }
          (match as any).teamA.win = teamA.win;
        }
      }
    }

    if (teamB !== undefined) {
      if (typeof teamB === 'object') {
        // Update teamB fields
        if (teamB.teamId !== undefined) {
          (match as any).teamB.teamId = toObjectId(teamB.teamId);
        }
        if (teamB.side !== undefined) {
          if (!["offense", "defense"].includes(teamB.side)) {
            return NextResponse.json(
              { error: "Side must be either 'offense' or 'defense'" },
              { status: 400 }
            );
          }
          (match as any).teamB.side = teamB.side;
        }
        if (teamB.players !== undefined) {
          (match as any).teamB.players = teamB.players.map((p: any) => ({
            playerId: toObjectId(p.playerId),
            isActive: p.isActive !== undefined ? p.isActive : false
          }));
        }
        if (teamB.score !== undefined) {
          (match as any).teamB.score = teamB.score;
        }
        if (teamB.win !== undefined) {
          if (teamB.win !== null && typeof teamB.win !== "boolean") {
            return NextResponse.json(
              { error: "Win must be a boolean (true for win, false for loss) or null" },
              { status: 400 }
            );
          }
          (match as any).teamB.win = teamB.win;
        }
      }
    }

    await match.save();

    // Populate references
    await match.populate("leagueId", "leagueName format startDate endDate logo");
    await match.populate("createdBy", "firstName lastName email role");
    await match.populate("teamA.teamId", "teamName enterCode");
    await match.populate("teamB.teamId", "teamName enterCode");
    await match.populate("teamA.players.playerId", "firstName lastName email");
    await match.populate("teamB.players.playerId", "firstName lastName email");
    await match.populate("teamA.playerStats.playerId", "firstName lastName email");
    await match.populate("teamB.playerStats.playerId", "firstName lastName email");
    await match.populate("teamA.playerActions.playerId", "firstName lastName email");
    await match.populate("teamB.playerActions.playerId", "firstName lastName email");
    if ((match as any).refereeId) {
      await match.populate("refereeId", "firstName lastName email role");
    }
    if ((match as any).statKeeperId) {
      await match.populate("statKeeperId", "firstName lastName email role");
    }
    if ((match as any).gameWinnerTeam) {
      await match.populate("gameWinnerTeam", "teamName enterCode");
    }

    // Convert to plain object
    const matchObj = match.toObject();

    return NextResponse.json(
      {
        message: "Match updated successfully",
        data: matchObj,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Update match error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to update match" },
      { status: 500 }
    );
  }
}

/**
 * Add game action
 * POST /api/match/:id/action
 */
const ACTION_SCORES: { [key: string]: number } = {
  "Touchdown": 6,
  "Extra Point from 5-yard line": 1,
  "Extra Point from 12-yard line": 2,
  "Extra Point from 20-yard line": 3,
  "Defensive Touchdown": 6,
  "Extra Point Return only": 2,
  "Safety": 2
};

function getActionScore(actionType: string): number {
  return ACTION_SCORES[actionType] || 0;
}

export async function addGameAction(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    ensureModelsRegistered();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    const { teamId, playerId, actionType, quarter } = await req.json() as any;

    // Validate required fields
    if (!teamId || !playerId || !actionType) {
      return NextResponse.json(
        { error: "Team ID, Player ID, and Action Type are required" },
        { status: 400 }
      );
    }

    // Validate action type
    const validActionTypes = [
      "Touchdown",
      "Extra Point from 5-yard line",
      "Extra Point from 12-yard line",
      "Extra Point from 20-yard line",
      "Defensive Touchdown",
      "Extra Point Return only",
      "Safety"
    ];

    if (!validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: "Invalid action type" },
        { status: 400 }
      );
    }

    // Get match
    const match = await Match.findById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Determine which team (A or B)
    const teamAId = (match as any).teamA.teamId.toString();
    const teamBId = (match as any).teamB.teamId.toString();
    const isTeamA = teamId === teamAId;

    if (!isTeamA && teamId !== teamBId) {
      return NextResponse.json(
        { error: "Team ID does not match either team in the match" },
        { status: 400 }
      );
    }

    const team = isTeamA ? (match as any).teamA : (match as any).teamB;
    const playerObjectId = toObjectId(playerId);

    // Calculate score for this action
    const actionScore = getActionScore(actionType);

    // Add action to playerActions array
    const newAction = {
      playerId: playerObjectId,
      actionType: actionType,
      timestamp: new Date(),
      quarter: quarter || "1"
    };

    // Ensure playerActions is an array
    if (!Array.isArray(team.playerActions)) {
      team.playerActions = [];
    }
    team.playerActions.push(newAction);

    // Mark the array as modified for Mongoose
    (match as any).markModified(isTeamA ? "teamA.playerActions" : "teamB.playerActions");

    // Update team score
    team.score = (team.score || 0) + actionScore;

    // NOTE: playerStats and teamStats are NOT updated here.
    // Only Stat Keeper (via POST /api/stats) updates playerStats and teamStats.
    // Referee only records actions and updates score.

    // Verify User to get name and position for the immutable action record
    const playerUser = await User.findById(playerObjectId);
    const playerName = playerUser ? `${playerUser.firstName} ${playerUser.lastName}` : "Unknown Player";
    const playerPosition = playerUser?.position || ""; // Assuming position field exists on User

    // Create the unified timeline action
    const timelineAction = {
      type: "score", // or 'player_action'
      teamId: toObjectId(teamId),
      playerId: playerObjectId,
      actionType: actionType,
      position: playerPosition,
      playerName: playerName,
      timestamp: new Date()
    };

    // Push to the new actions timeline
    if (!(match as any).actions) {
      (match as any).actions = [];
    }
    (match as any).actions.push(timelineAction);
    (match as any).markModified("actions");

    // Score was already updated once above via team.score; only mark path modified
    const scorePath = isTeamA ? 'teamA.score' : 'teamB.score';
    const previousScore = (team.score || 0) - actionScore;
    console.log(`[DEBUG] Action added for Team ${isTeamA ? 'A' : 'B'} (${teamId}). Old Score: ${previousScore}, New Score: ${team.score}`);

    // Mark as modified (only playerActions and score)
    (match as any).markModified(isTeamA ? "teamA.playerActions" : "teamB.playerActions");
    (match as any).markModified(scorePath);

    // Set status to "continue" if it's still "upcoming" (first action)
    if ((match as any).status === "upcoming") {
      (match as any).status = "continue";
    }

    await match.save();

    // Update global stats
    try {
      if ((match as any).leagueId) {
        // 1. Update Scoring Team: +PF, +PD
        await Leaderboard.findOneAndUpdate(
          {
            leagueId: (match as any).leagueId,
            "teams.teamId": team.teamId
          },
          {
            $inc: {
              "teams.$.pointsScored": actionScore,
              "teams.$.pointDifference": actionScore
            }
          }
        );

        // 2. Update Opponent Team: +PA, -PD
        const opponentId = isTeamA ? teamBId : teamAId;
        await Leaderboard.findOneAndUpdate(
          {
            leagueId: (match as any).leagueId,
            "teams.teamId": toObjectId(opponentId)
          },
          {
            $inc: {
              "teams.$.pointsAgainst": actionScore,
              "teams.$.pointDifference": -actionScore
            }
          }
        );
      }

      // Note: User.totalPoints will be updated by Stat Keeper via POST /api/stats
      // Referee only records actions, Stat Keeper validates and finalizes all stats
    } catch (statsError) {
      console.error("Error updating global stats:", statsError);
      // Don't fail the request if stats update fails
    }

    // Populate and return
    await match.populate("leagueId", "leagueName format startDate endDate logo");
    await match.populate("createdBy", "firstName lastName email role");
    await match.populate("teamA.teamId", "teamName enterCode");
    await match.populate("teamB.teamId", "teamName enterCode");
    await match.populate("teamA.players.playerId", "firstName lastName email");
    await match.populate("teamB.players.playerId", "firstName lastName email");
    await match.populate("teamA.playerStats.playerId", "firstName lastName email");
    await match.populate("teamB.playerStats.playerId", "firstName lastName email");
    await match.populate("teamA.playerActions.playerId", "firstName lastName email");
    await match.populate("teamB.playerActions.playerId", "firstName lastName email");
    await match.populate("refereeId", "firstName lastName email role");
    await match.populate("statKeeperId", "firstName lastName email role");
    await match.populate("gameWinnerTeam", "teamName enterCode");

    return NextResponse.json(
      {
        message: "Action added successfully",
        data: match,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Add game action error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to add action" },
      { status: 500 }
    );
  }
}

/**
 * Switch half time - swap sides and set timesSwitched to halfTime
 * POST /api/match/:id/halftime
 */
export async function switchHalfTime(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    // Get match
    const existingMatch = await Match.findById(matchId);
    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Push Half Time milestone to timeline
    if (!(existingMatch as any).actions) {
      (existingMatch as any).actions = [];
    }
    (existingMatch as any).actions.push({
      type: "halftime",
      actionType: "Half Time",
      timestamp: new Date()
    });

    // Swap sides and update timesSwitched
    const teamASide = (existingMatch as any).teamA.side;
    const teamBSide = (existingMatch as any).teamB.side;
    const newTeamASide = teamASide === "offense" ? "defense" : "offense";
    const newTeamBSide = teamBSide === "offense" ? "defense" : "offense";

    (existingMatch as any).teamA.side = newTeamASide;
    (existingMatch as any).teamB.side = newTeamBSide;
    (existingMatch as any).timesSwitched = "halfTime";

    await existingMatch.save();

    // Reload the match to get updated data
    const updatedMatch = await Match.findById(matchId);
    if (!updatedMatch) {
      return NextResponse.json({ error: "Match not found after update" }, { status: 404 });
    }

    // Populate and return
    await updatedMatch.populate("leagueId", "leagueName format startDate endDate logo");
    await updatedMatch.populate("createdBy", "firstName lastName email role");
    await updatedMatch.populate("teamA.teamId", "teamName enterCode");
    await updatedMatch.populate("teamB.teamId", "teamName enterCode");
    await updatedMatch.populate("teamA.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("refereeId", "firstName lastName email role");
    await updatedMatch.populate("statKeeperId", "firstName lastName email role");
    await updatedMatch.populate("gameWinnerTeam", "teamName enterCode");

    return NextResponse.json(
      {
        message: "Half time switched successfully",
        data: updatedMatch,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Switch half time error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to switch half time" },
      { status: 500 }
    );
  }
}

/**
 * Switch full time - swap sides again and set timesSwitched to fullTime
 * POST /api/match/:id/fulltime
 * This swaps the team sides a second time and sets the match to full time
 * Note: This function does NOT modify the match status field
 */
export async function switchFullTime(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    // Get match
    const existingMatch = await Match.findById(matchId);
    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Push Full Time milestone to timeline
    if (!(existingMatch as any).actions) {
      (existingMatch as any).actions = [];
    }
    (existingMatch as any).actions.push({
      type: "fulltime",
      actionType: "Full Time",
      timestamp: new Date()
    });

    // Swap sides again (second swap) and update timesSwitched
    const teamASide = (existingMatch as any).teamA.side;
    const teamBSide = (existingMatch as any).teamB.side;
    const newTeamASide = teamASide === "offense" ? "defense" : "offense";
    const newTeamBSide = teamBSide === "offense" ? "defense" : "offense";

    (existingMatch as any).teamA.side = newTeamASide;
    (existingMatch as any).teamB.side = newTeamBSide;
    (existingMatch as any).timesSwitched = "fullTime";

    await existingMatch.save();

    // Reload the match to get updated data
    const updatedMatch = await Match.findById(matchId);
    if (!updatedMatch) {
      return NextResponse.json({ error: "Match not found after update" }, { status: 404 });
    }

    // Populate and return
    await updatedMatch.populate("leagueId", "leagueName format startDate endDate logo");
    await updatedMatch.populate("createdBy", "firstName lastName email role");
    await updatedMatch.populate("teamA.teamId", "teamName enterCode");
    await updatedMatch.populate("teamB.teamId", "teamName enterCode");
    await updatedMatch.populate("teamA.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("refereeId", "firstName lastName email role");
    await updatedMatch.populate("statKeeperId", "firstName lastName email role");
    await updatedMatch.populate("gameWinnerTeam", "teamName enterCode");

    return NextResponse.json(
      {
        message: "Full time switched successfully",
        data: updatedMatch,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Switch full time error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to switch full time" },
      { status: 500 }
    );
  }
}

/**
 * Switch overtime - set timesSwitched to overtime (no side swapping)
 * POST /api/match/:id/overtime
 * This only updates timesSwitched to "overtime" without swapping team sides
 * Note: This function does NOT modify the match status field
 */
export async function switchOvertime(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    // Get match
    const existingMatch = await Match.findById(matchId);
    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Push Over Time milestone to timeline
    if (!(existingMatch as any).actions) {
      (existingMatch as any).actions = [];
    }
    (existingMatch as any).actions.push({
      type: "overtime",
      actionType: "Over Time",
      timestamp: new Date()
    });

    (existingMatch as any).timesSwitched = "overtime";

    await existingMatch.save();

    // Reload the match to get updated data
    const updatedMatch = await Match.findById(matchId);
    if (!updatedMatch) {
      return NextResponse.json({ error: "Match not found after update" }, { status: 404 });
    }

    // Populate and return
    await updatedMatch.populate("leagueId", "leagueName format startDate endDate logo");
    await updatedMatch.populate("createdBy", "firstName lastName email role");
    await updatedMatch.populate("teamA.teamId", "teamName enterCode");
    await updatedMatch.populate("teamB.teamId", "teamName enterCode");
    await updatedMatch.populate("teamA.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.players.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerStats.playerId", "firstName lastName email");
    await updatedMatch.populate("teamA.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("teamB.playerActions.playerId", "firstName lastName email");
    await updatedMatch.populate("refereeId", "firstName lastName email role");
    await updatedMatch.populate("statKeeperId", "firstName lastName email role");
    await updatedMatch.populate("gameWinnerTeam", "teamName enterCode");

    return NextResponse.json(
      {
        message: "Overtime switched successfully",
        data: updatedMatch,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Switch overtime error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to switch overtime" },
      { status: 500 }
    );
  }
}

/**
 * Update match toss
 * POST /api/match/:id/toss
 */
export async function updateToss(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const matchId = toObjectId(id);

    const body = await req.json() as any;
    const winningTeamId = body.winningTeamId || body.winnerTeamId;
    const choice = body.choice || body.winnerSide;

    if (!winningTeamId || !choice) {
      return NextResponse.json(
        { error: "Winning Team ID (winnerTeamId) and Choice (winnerSide) are required" },
        { status: 400 }
      );
    }

    if (!["offense", "defense"].includes(choice)) {
      return NextResponse.json(
        { error: "Choice must be 'offense' or 'defense'" },
        { status: 400 }
      );
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const winningTeamObjectId = toObjectId(winningTeamId);

    // Identify which team is A and which is B
    // We need to compare ObjectIds as strings to be safe
    const teamAIdString = (match as any).teamA.teamId.toString();
    const teamBIdString = (match as any).teamB.teamId.toString();
    const winningTeamIdString = winningTeamObjectId.toString();

    let teamA = (match as any).teamA;
    let teamB = (match as any).teamB;

    if (teamAIdString === winningTeamIdString) {
      // Team A won toss
      if (choice === "offense") {
        teamA.side = "offense";
        teamB.side = "defense";
      } else {
        teamA.side = "defense";
        teamB.side = "offense";
      }
    } else if (teamBIdString === winningTeamIdString) {
      // Team B won toss
      if (choice === "offense") {
        teamB.side = "offense";
        teamA.side = "defense";
      } else {
        teamB.side = "defense";
        teamA.side = "offense";
      }
    } else {
      return NextResponse.json(
        { error: "Winning team is not part of this match" },
        { status: 400 }
      );
    }

    await match.save();

    // Return updated match
    return NextResponse.json(
      {
        message: "Toss updated successfully",
        data: match,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Update toss error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update toss" },
      { status: 500 }
    );
  }
}


