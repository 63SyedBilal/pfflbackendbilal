import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { League, User, Team, Notification } from "@/modules";
import { verifyAccessToken } from "@/lib/jwt";
import mongoose from "mongoose";
import { initializeLeaderboard, addTeamToLeaderboard } from "./leaderboard";
import { uploadToCloudinary, uploadImageToCloudinary } from "@/lib/cloudinary";

// Helper to convert string ID to ObjectId
function toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  return new mongoose.Types.ObjectId(id);
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

// Helper to verify admin from token
async function verifyAdmin(req: NextRequest) {
  const token = getToken(req);
  if (!token) throw new Error("No token provided");

  const decoded = verifyAccessToken(token);
  if (decoded.role !== "superadmin") throw new Error("Unauthorized");

  return decoded;
}

/** Compute league status from start/end dates: pending → active (at start), active → completed (after end). */
function getLeagueStatusFromDates(startDate: Date, endDate: Date): "pending" | "active" | "completed" {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end.getTime() <= now.getTime()) return "completed";
  if (start.getTime() <= now.getTime()) return "active";
  return "pending";
}

/**
 * Create league (only superadmin can create)
 * POST /api/league
 */
export async function createLeague(req: NextRequest) {
  try {
    await connectDB();
    const decoded = await verifyAdmin(req);
    const adminId = (decoded as any).userId || (decoded as any).id;

    const body = await req.json() as {
      leagueName?: string; logo?: string; format?: string; startDate?: string | Date; endDate?: string | Date;
      minimumPlayers?: number; entryFeeType?: string; perPlayerLeagueFee?: number; referees?: string[];
      statKeepers?: string[]; teams?: string[]; status?: string;
    };
    const {
      leagueName,
      logo,
      format,
      startDate,
      endDate,
      minimumPlayers,
      entryFeeType,
      perPlayerLeagueFee,
      referees,
      statKeepers,
      teams,
      status
    } = body;

    // Validate required fields
    if (!leagueName || !format || !startDate || !endDate || minimumPlayers == null || !entryFeeType) {
      return NextResponse.json(
        { error: "League name, format, start date, end date, minimum players, and entry fee type are required" },
        { status: 400 }
      );
    }

    // Validate format enum
    if (!["5v5", "7v7"].includes(String(format))) {
      return NextResponse.json({ error: "Format must be either '5v5' or '7v7'" }, { status: 400 });
    }

    // Validate entryFeeType enum
    if (!["stripe", "paypal"].includes(String(entryFeeType))) {
      return NextResponse.json({ error: "Entry fee type must be either 'stripe' or 'paypal'" }, { status: 400 });
    }

    // Validate dates
    const start = new Date(startDate as string | Date);
    const end = new Date(endDate as string | Date);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    if (start >= end) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    // Validate minimum players
    if (Number(minimumPlayers) < 1) {
      return NextResponse.json({ error: "Minimum players must be at least 1" }, { status: 400 });
    }

    // Validate status enum
    if (status && !["active", "pending", "completed"].includes(String(status))) {
      return NextResponse.json({ error: "Status must be 'active', 'pending', or 'completed'" }, { status: 400 });
    }

    // Validate and process referees array if provided
    let validatedReferees: mongoose.Types.ObjectId[] = [];
    if (referees && Array.isArray(referees)) {
      for (const refId of referees) {
        if (!mongoose.Types.ObjectId.isValid(String(refId))) {
          return NextResponse.json({ error: `Invalid referee ID: ${refId}` }, { status: 400 });
        }
        const referee = await User.findById(refId);
        if (!referee) {
          return NextResponse.json({ error: `Referee not found: ${refId}` }, { status: 404 });
        }
        if (referee.role !== "referee") {
          return NextResponse.json({ error: `User ${refId} is not a referee` }, { status: 400 });
        }
        validatedReferees.push(toObjectId(String(refId)));
      }
    }

    // Validate and process stat keepers array if provided
    let validatedStatKeepers: mongoose.Types.ObjectId[] = [];
    if (statKeepers && Array.isArray(statKeepers)) {
      for (const skId of statKeepers) {
        if (!mongoose.Types.ObjectId.isValid(String(skId))) {
          return NextResponse.json({ error: `Invalid stat keeper ID: ${skId}` }, { status: 400 });
        }
        const statKeeper = await User.findById(skId);
        if (!statKeeper) {
          return NextResponse.json({ error: `Stat keeper not found: ${skId}` }, { status: 404 });
        }
        if (statKeeper.role !== "stat-keeper") {
          return NextResponse.json({ error: `User ${skId} is not a stat-keeper` }, { status: 400 });
        }
        validatedStatKeepers.push(toObjectId(String(skId)));
      }
    }

    // Validate and process teams array if provided
    let validatedTeams: mongoose.Types.ObjectId[] = [];
    if (teams && Array.isArray(teams)) {
      for (const teamId of teams) {
        if (!mongoose.Types.ObjectId.isValid(String(teamId))) {
          return NextResponse.json({ error: `Invalid team ID: ${teamId}` }, { status: 400 });
        }
        const team = await Team.findById(teamId);
        if (!team) {
          return NextResponse.json({ error: `Team not found: ${teamId}` }, { status: 404 });
        }
        validatedTeams.push(toObjectId(String(teamId)));
      }
    }

    // Handle logo upload - supports base64, regular URLs, and Cloudinary URLs
    let logoUrl = logo || "";
    if (logo && typeof logo === "string" && (logo as string).trim() !== "") {
      try {
        logoUrl = await uploadImageToCloudinary(logo as string, {
          folder: "pffl/leagues",
          resource_type: "image",
        });
      } catch (uploadError: any) {
        console.error("❌ Failed to upload league logo to Cloudinary:", uploadError);
        return NextResponse.json(
          { error: `Failed to upload logo: ${uploadError.message}` },
          { status: 500 }
        );
      }
    }

    const leagueData: any = {
      leagueName: String(leagueName).trim(),
      format,
      startDate: start,
      endDate: end,
      minimumPlayers,
      entryFeeType,
      perPlayerLeagueFee: perPlayerLeagueFee || 0,
      logo: logoUrl,
      status: status || "pending",
      referees: validatedReferees,
      statKeepers: validatedStatKeepers,
      teams: validatedTeams,
    };

    const league = await League.create(leagueData);
    const leagueId = (league as any)._id.toString();

    // Initialize leaderboard for this league
    try {
      await initializeLeaderboard(leagueId);
    } catch (leaderboardError: any) {
      console.error("Error initializing leaderboard:", leaderboardError);
      // Don't fail league creation if leaderboard init fails
    }

    // Create payment records and payment-required notifications for players in teams (when league is created with teams)
    if (validatedTeams.length > 0 && adminId) {
      try {
        const { createPayment } = await import("@/controller/payment");
        const leagueObjectId = toObjectId(leagueId);
        const leagueDoc = await League.findById(leagueObjectId).lean();
        const leagueName = (leagueDoc as any)?.leagueName || "this league";

        for (const teamId of validatedTeams) {
          const team = await Team.findById(teamId).lean();
          if (!team) continue;
          const captainId = (team as any).captain?.toString?.() || (team as any).captain;
          const squad5 = ((team as any).squad5v5 || []).map((id: any) => id?.toString?.() || String(id));
          const squad7 = ((team as any).squad7v7 || []).map((id: any) => id?.toString?.() || String(id));
          const allPlayerIds = [...new Set([captainId, ...squad5, ...squad7].filter(Boolean))];

          for (const playerIdStr of allPlayerIds) {
            try {
              const user = await User.findById(playerIdStr).lean();
              if (!user || !["player", "captain", "free-agent"].includes((user as any).role)) continue;
              const playerObjectId = toObjectId(playerIdStr);
              await createPayment(playerObjectId, leagueObjectId, teamId);
              await Notification.create({
                sender: toObjectId(adminId),
                receiver: playerObjectId,
                league: leagueObjectId,
                team: teamId,
                type: "PAYMENT_REQUIRED",
                message: `League fee payment required for ${leagueName}.`,
                status: "pending",
              });
            } catch (err: any) {
              console.error("Error creating payment/notification for player on league create:", err);
            }
          }
        }
      } catch (paymentNotifyError: any) {
        console.error("Error creating payments/notifications on league create:", paymentNotifyError);
        // Don't fail league creation
      }
    }

    // Populate related fields
    const populatedLeague = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    // Ensure the _id is included as a string in the response
    const responseData = {
      ...(populatedLeague as any).toObject(),
      _id: leagueId,
      id: leagueId
    };

    return NextResponse.json(
      {
        message: "League created successfully",
        data: responseData,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to create league" }, { status: 500 });
  }
}

/**
 * Get all leagues (with optional filters)
 * GET /api/league?status=active&format=5v5
 */
export async function getAllLeagues(req: NextRequest) {
  try {
    await connectDB();
    await verifyUser(req);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const format = searchParams.get("format");

    let query: any = {};

    if (status) {
      if (!["active", "pending", "completed"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
      }
      query.status = status;
    }

    if (format) {
      if (!["5v5", "7v7"].includes(format)) {
        return NextResponse.json({ error: "Invalid format filter" }, { status: 400 });
      }
      query.format = format;
    }

    // Sync stored status with dates: pending→active when startDate reached, active→completed when endDate passed
    const now = new Date();
    await League.updateMany(
      { status: "pending", startDate: { $lte: now } },
      { $set: { status: "active" } }
    );
    await League.updateMany(
      { status: "active", endDate: { $lt: now } },
      { $set: { status: "completed" } }
    );

    const leagues = await League.find(query)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel")
      .sort({ createdAt: -1 })
      .exec();

    // Set response status from dates (pending until start, active until end, then completed)
    const leaguesWithStatus = leagues.map((league: any) => {
      const leagueObj = league.toObject();
      leagueObj.status = getLeagueStatusFromDates(leagueObj.startDate, leagueObj.endDate);
      return leagueObj;
    });

    return NextResponse.json(
      {
        message: "Leagues retrieved successfully",
        data: leaguesWithStatus,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to get leagues" }, { status: 500 });
  }
}

/**
 * Get league by ID
 * GET /api/league/:id
 */
export async function getLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyUser(req);

    const { id } = params;
    const leagueId = toObjectId(id);

    const league = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const leagueObj = (league as any).toObject();
    const effectiveStatus = getLeagueStatusFromDates(leagueObj.startDate, leagueObj.endDate);
    if (leagueObj.status !== effectiveStatus) {
      (league as any).status = effectiveStatus;
      await (league as any).save();
    }
    leagueObj.status = effectiveStatus;

    return NextResponse.json(
      {
        message: "League retrieved successfully",
        data: leagueObj,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to get league" }, { status: 500 });
  }
}

/**
 * Update league
 * PUT /api/league/:id
 */
export async function updateLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id } = params;
    const leagueId = toObjectId(id);
    const updateBody = await req.json() as {
      leagueName?: string | null; logo?: string | null; format?: string; startDate?: string | Date | null;
      endDate?: string | Date | null; minimumPlayers?: number | null; entryFeeType?: string | null;
      perPlayerLeagueFee?: number | null; teams?: string[]; status?: string | null;
    };
    const {
      leagueName,
      logo,
      format,
      startDate,
      endDate,
      minimumPlayers,
      entryFeeType,
      perPlayerLeagueFee,
      teams,
      status,
    } = updateBody;

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    if (leagueName !== undefined && leagueName != null) {
      (league as any).leagueName = String(leagueName).trim();
    }

    if (logo !== undefined && logo !== null && logo !== "") {
      try {
        (league as any).logo = await uploadImageToCloudinary(String(logo), {
          folder: "pffl/leagues",
          resource_type: "image",
        });
      } catch (uploadError: any) {
        console.error("❌ Failed to upload league logo to Cloudinary:", uploadError);
        return NextResponse.json(
          { error: `Failed to upload logo: ${uploadError.message}` },
          { status: 500 }
        );
      }
    }

    if (format !== undefined) {
      if (!["5v5", "7v7"].includes(String(format))) {
        return NextResponse.json({ error: "Format must be either '5v5' or '7v7'" }, { status: 400 });
      }
      (league as any).format = format;
    }

    if (startDate !== undefined && startDate != null) {
      const start = new Date(startDate as string | Date);
      if (isNaN(start.getTime())) {
        return NextResponse.json({ error: "Invalid start date format" }, { status: 400 });
      }
      (league as any).startDate = start;
    }

    if (endDate !== undefined && endDate != null) {
      const end = new Date(endDate as string | Date);
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid end date format" }, { status: 400 });
      }
      (league as any).endDate = end;
    }

    // Validate date range if both dates are being updated
    if (startDate !== undefined || endDate !== undefined) {
      const start = (league as any).startDate;
      const end = (league as any).endDate;
      if (start >= end) {
        return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
      }
    }

    if (minimumPlayers !== undefined && minimumPlayers != null) {
      if (Number(minimumPlayers) < 1) {
        return NextResponse.json({ error: "Minimum players must be at least 1" }, { status: 400 });
      }
      (league as any).minimumPlayers = minimumPlayers;
    }

    if (entryFeeType !== undefined && entryFeeType != null) {
      if (!["stripe", "paypal"].includes(String(entryFeeType))) {
        return NextResponse.json({ error: "Entry fee type must be either 'stripe' or 'paypal'" }, { status: 400 });
      }
      (league as any).entryFeeType = entryFeeType;
    }

    if (perPlayerLeagueFee !== undefined && perPlayerLeagueFee != null) {
      (league as any).perPlayerLeagueFee = perPlayerLeagueFee;
    }

    // Teams, referees, and stat keepers are managed via invitations, not direct updates
    // They can only be added/removed through the invitation accept/reject flow

    if (status !== undefined && status != null) {
      if (!["active", "pending", "completed"].includes(String(status))) {
        return NextResponse.json({ error: "Status must be 'active', 'pending', or 'completed'" }, { status: 400 });
      }
      (league as any).status = status;
    }

    await league.save();

    // Populate before returning
    const populatedLeague = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    return NextResponse.json(
      {
        message: "League updated successfully",
        data: populatedLeague,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to update league" }, { status: 500 });
  }
}

/**
 * Delete league
 * DELETE /api/league/:id
 */
export async function deleteLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id } = params;
    const leagueId = toObjectId(id);

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    await League.findByIdAndDelete(leagueId);

    return NextResponse.json({ message: "League deleted successfully" }, { status: 200 });
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to delete league" }, { status: 500 });
  }
}

/**
 * Add team to league
 * POST /api/league/:id/teams
 * Body: { teamId: string }
 */
export async function addTeamToLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id } = params;
    const leagueId = toObjectId(id);
    const { teamId } = (await req.json()) as { teamId?: string };

    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teams = (league as any).teams || [];

    // Check if team is already in the league
    if (teams.some((t: any) => t.toString() === teamId)) {
      return NextResponse.json({ error: "Team already in league" }, { status: 409 });
    }

    teams.push(teamId);
    (league as any).teams = teams;
    await league.save();

    // Add team to leaderboard
    try {
      await addTeamToLeaderboard(leagueId, teamId);
    } catch (leaderboardError: any) {
      console.error("Error adding team to leaderboard:", leaderboardError);
      // Don't fail team addition if leaderboard update fails
    }

    const populatedLeague = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    return NextResponse.json(
      {
        message: "Team added to league successfully",
        data: populatedLeague,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to add team to league" }, { status: 500 });
  }
}

/**
 * Remove team from league
 * DELETE /api/league/:id/teams/:teamId
 */
export async function removeTeamFromLeague(req: NextRequest, { params }: { params: { id: string; teamId: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id, teamId } = params;
    const leagueId = toObjectId(id);

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const teams = (league as any).teams || [];

    // Check if team is in the league
    if (!teams.some((t: any) => t.toString() === teamId)) {
      return NextResponse.json({ error: "Team not in league" }, { status: 404 });
    }

    (league as any).teams = teams.filter((t: any) => t.toString() !== teamId);
    await league.save();

    const populatedLeague = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    return NextResponse.json(
      {
        message: "Team removed from league successfully",
        data: populatedLeague,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to remove team from league" }, { status: 500 });
  }
}

/**
 * Invite referee to league
 * POST /api/league/:id/invite-referee
 * Body: { refereeId: string }
 */
export async function inviteRefereeToLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const decoded = await verifyAdmin(req);

    const { id } = params;
    const { refereeId } = (await req.json()) as { refereeId?: string };

    console.log("inviteRefereeToLeague - League ID:", id);
    console.log("inviteRefereeToLeague - Referee ID:", refereeId);
    console.log("inviteRefereeToLeague - League ID type:", typeof id);

    if (!id) {
      console.error("inviteRefereeToLeague - League ID is missing!");
      return NextResponse.json({ error: "League ID is required" }, { status: 400 });
    }

    if (!refereeId) {
      return NextResponse.json({ error: "Referee ID is required" }, { status: 400 });
    }

    // Convert league ID to ObjectId
    const leagueId = toObjectId(id);
    console.log("inviteRefereeToLeague - Searching for league with ID:", leagueId.toString());
    const league = await League.findById(leagueId);
    if (!league) {
      console.error("inviteRefereeToLeague - League not found with ID:", id);
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    console.log("inviteRefereeToLeague - League found:", {
      _id: (league as any)._id?.toString(),
      leagueName: (league as any).leagueName
    });

    const referee = await User.findById(refereeId);
    if (!referee) {
      return NextResponse.json({ error: "Referee not found" }, { status: 404 });
    }

    if (referee.role !== "referee") {
      return NextResponse.json({ error: "User is not a referee" }, { status: 400 });
    }

    // Check if referee is already in the league
    const referees = (league as any).referees || [];
    if (referees.some((r: any) => r.toString() === refereeId)) {
      return NextResponse.json({ error: "Referee already in league" }, { status: 409 });
    }

    // Convert IDs to ObjectIds (leagueId already converted above)
    const senderId = toObjectId(decoded.userId);
    const receiverId = toObjectId(refereeId);

    // Check if there's already a pending invite
    const existingNotification = await Notification.findOne({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      type: "LEAGUE_REFEREE_INVITE",
      status: "pending"
    });

    if (existingNotification) {
      return NextResponse.json({ error: "Invite already sent to this referee" }, { status: 409 });
    }

    // Create notification with ObjectIds
    const notification = await Notification.create({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      type: "LEAGUE_REFEREE_INVITE",
      status: "pending"
    });

    console.log("Created referee notification:", {
      notificationId: notification._id,
      sender: senderId.toString(),
      receiver: receiverId.toString(),
      league: leagueId.toString(),
      type: "LEAGUE_REFEREE_INVITE"
    });

    await notification.populate("sender", "firstName lastName email");
    await notification.populate("receiver", "firstName lastName email");
    await notification.populate("league", "leagueName");

    return NextResponse.json(
      {
        message: "Referee invitation sent successfully",
        data: notification
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to invite referee" }, { status: 500 });
  }
}

/**
 * Invite stat keeper to league
 * POST /api/league/:id/invite-statkeeper
 * Body: { statKeeperId: string }
 */
export async function inviteStatKeeperToLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const decoded = await verifyAdmin(req);

    const { id } = params;
    const { statKeeperId } = (await req.json()) as { statKeeperId?: string };

    console.log("inviteStatKeeperToLeague - League ID:", id);
    console.log("inviteStatKeeperToLeague - Stat Keeper ID:", statKeeperId);
    console.log("inviteStatKeeperToLeague - League ID type:", typeof id);

    if (!id) {
      console.error("inviteStatKeeperToLeague - League ID is missing!");
      return NextResponse.json({ error: "League ID is required" }, { status: 400 });
    }

    if (!statKeeperId) {
      return NextResponse.json({ error: "Stat keeper ID is required" }, { status: 400 });
    }

    // Convert league ID to ObjectId
    const leagueId = toObjectId(id);
    console.log("inviteStatKeeperToLeague - Searching for league with ID:", leagueId.toString());
    const league = await League.findById(leagueId);
    if (!league) {
      console.error("inviteStatKeeperToLeague - League not found with ID:", id);
      console.error("inviteStatKeeperToLeague - Checking if league exists with different format...");
      // Try to find by string comparison
      const allLeagues = await League.find({});
      console.log("inviteStatKeeperToLeague - Total leagues in DB:", allLeagues.length);
      allLeagues.forEach((l: any) => {
        console.log("inviteStatKeeperToLeague - League in DB:", {
          _id: l._id?.toString(),
          id: l.id,
          leagueName: l.leagueName
        });
      });
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    console.log("inviteStatKeeperToLeague - League found:", {
      _id: (league as any)._id?.toString(),
      leagueName: (league as any).leagueName
    });

    const statKeeper = await User.findById(statKeeperId);
    if (!statKeeper) {
      return NextResponse.json({ error: "Stat keeper not found" }, { status: 404 });
    }

    if (statKeeper.role !== "stat-keeper") {
      return NextResponse.json({ error: "User is not a stat keeper" }, { status: 400 });
    }

    // Check if stat keeper is already in the league
    const statKeepers = (league as any).statKeepers || [];
    if (statKeepers.some((sk: any) => sk.toString() === statKeeperId)) {
      return NextResponse.json({ error: "Stat keeper already in league" }, { status: 409 });
    }

    // Convert IDs to ObjectIds
    const senderId = toObjectId(decoded.userId);
    const receiverId = toObjectId(statKeeperId);

    // Check if there's already a pending invite
    const existingNotification = await Notification.findOne({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      type: "LEAGUE_STATKEEPER_INVITE",
      status: "pending"
    });

    if (existingNotification) {
      return NextResponse.json({ error: "Invite already sent to this stat keeper" }, { status: 409 });
    }

    // Create notification with ObjectIds
    const notification = await Notification.create({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      type: "LEAGUE_STATKEEPER_INVITE",
      status: "pending"
    });

    console.log("Created stat keeper notification:", {
      notificationId: notification._id,
      sender: senderId.toString(),
      receiver: receiverId.toString(),
      league: leagueId.toString(),
      type: "LEAGUE_STATKEEPER_INVITE"
    });

    // Verify notification was saved correctly
    const savedNotification = await Notification.findById(notification._id);
    console.log("Saved notification:", {
      sender: savedNotification?.sender?.toString(),
      receiver: savedNotification?.receiver?.toString(),
      league: savedNotification?.league?.toString()
    });

    await notification.populate("sender", "firstName lastName email");
    await notification.populate("receiver", "firstName lastName email");
    await notification.populate("league", "leagueName");

    return NextResponse.json(
      {
        message: "Stat keeper invitation sent successfully",
        data: notification
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to invite stat keeper" }, { status: 500 });
  }
}

/**
 * Invite team to league
 * POST /api/league/:id/invite-team
 * Body: { teamId: string }
 */
export async function inviteTeamToLeague(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const decoded = await verifyAdmin(req);

    const { id } = params;
    const { teamId } = (await req.json()) as { teamId?: string };

    console.log("inviteTeamToLeague - League ID:", id);
    console.log("inviteTeamToLeague - Team ID:", teamId);
    console.log("inviteTeamToLeague - League ID type:", typeof id);

    if (!id) {
      console.error("inviteTeamToLeague - League ID is missing!");
      return NextResponse.json({ error: "League ID is required" }, { status: 400 });
    }

    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    // Convert league ID to ObjectId
    const leagueId = toObjectId(id);
    console.log("inviteTeamToLeague - Searching for league with ID:", leagueId.toString());
    const league = await League.findById(leagueId);
    if (!league) {
      console.error("inviteTeamToLeague - League not found with ID:", id);
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    console.log("inviteTeamToLeague - League found:", {
      _id: (league as any)._id?.toString(),
      leagueName: (league as any).leagueName
    });

    const team = await Team.findById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Check if team is already in the league
    const teams = (league as any).teams || [];
    if (teams.some((t: any) => t.toString() === teamId)) {
      return NextResponse.json({ error: "Team already in league" }, { status: 409 });
    }

    // Get team captain to send notification to
    const captainId = team.captain.toString();

    // Convert IDs to ObjectIds
    const senderId = toObjectId(decoded.userId);
    const receiverId = toObjectId(captainId);
    const teamObjectId = toObjectId(teamId);

    // Check if there's already a pending invite
    const existingNotification = await Notification.findOne({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      team: teamObjectId,
      type: "LEAGUE_TEAM_INVITE",
      status: "pending"
    });

    if (existingNotification) {
      return NextResponse.json({ error: "Invite already sent to this team" }, { status: 409 });
    }

    // Create notification for team captain with ObjectIds
    const notification = await Notification.create({
      sender: senderId,
      receiver: receiverId,
      league: leagueId,
      team: teamObjectId,
      type: "LEAGUE_TEAM_INVITE",
      status: "pending"
    });

    console.log("Created team notification:", {
      notificationId: notification._id,
      sender: senderId.toString(),
      receiver: receiverId.toString(),
      league: leagueId.toString(),
      team: teamObjectId.toString(),
      type: "LEAGUE_TEAM_INVITE"
    });

    await notification.populate("sender", "firstName lastName email");
    await notification.populate("receiver", "firstName lastName email");
    await notification.populate("league", "leagueName");
    await notification.populate("team", "teamName");

    return NextResponse.json(
      {
        message: "Team invitation sent successfully",
        data: notification
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Failed to invite team" }, { status: 500 });
  }
}


/**
 * Upload league logo
 * POST /api/league/:id/upload-logo
 */
export async function uploadLeagueLogo(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id } = params;
    const leagueId = toObjectId(id);

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const result = await uploadToCloudinary(buffer, {
      folder: "pffl/leagues",
      resource_type: "image",
    });

    // Update league logo
    (league as any).logo = result.secure_url;
    await league.save();

    const populatedLeague = await League.findById(leagueId)
      .populate("referees", "firstName lastName email role")
      .populate("statKeepers", "firstName lastName email role")
      .populate("teams", "teamName enterCode location skillLevel");

    return NextResponse.json(
      {
        message: "League logo uploaded successfully",
        data: populatedLeague,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Failed to upload logo" }, { status: 500 });
  }
}

/**
 * Set league winner – increments User.stats.leaguesWon5v5 or leaguesWon7v7 for all players in the winning team.
 * Call this when a league is finalized (e.g. by superadmin).
 * POST /api/league/:id/set-winner
 * Body: { winningTeamId: string }
 */
export async function setLeagueWinner(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    await verifyAdmin(req);

    const { id } = params;
    const leagueId = toObjectId(id);
    const body = (await req.json()) as any;
    const winningTeamId = body.winningTeamId;

    if (!winningTeamId) {
      return NextResponse.json({ error: "winningTeamId is required" }, { status: 400 });
    }

    const league = await League.findById(leagueId);
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const format = (league as any).format as string;
    if (format !== "5v5" && format !== "7v7") {
      return NextResponse.json({ error: "League format must be 5v5 or 7v7" }, { status: 400 });
    }

    const team = await Team.findById(winningTeamId);
    if (!team) {
      return NextResponse.json({ error: "Winning team not found" }, { status: 404 });
    }

    const leagueTeams = (league as any).teams || [];
    if (!leagueTeams.some((t: any) => String(t) === String(winningTeamId))) {
      return NextResponse.json({ error: "Winning team is not part of this league" }, { status: 400 });
    }

    const playerIds = new Set<string>();
    const captain = (team as any).captain;
    if (captain) playerIds.add(String(captain));
    const squad5 = (team as any).squad5v5 || [];
    const squad7 = (team as any).squad7v7 || [];
    squad5.forEach((id: any) => playerIds.add(String(id)));
    squad7.forEach((id: any) => playerIds.add(String(id)));
    const players = (team as any).players;
    if (Array.isArray(players)) {
      players.forEach((p: any) => {
        const pid = p.playerId || p;
        if (pid) playerIds.add(String(pid));
      });
    }

    const field = format === "5v5" ? "stats.leaguesWon5v5" : "stats.leaguesWon7v7";
    for (const uid of playerIds) {
      await User.findByIdAndUpdate(uid, {
        $inc: { [field]: 1 },
        $set: { "stats.lastUpdated": new Date() },
      });
    }
    await Team.findByIdAndUpdate(winningTeamId, {
      $inc: { [field]: 1 },
      $set: { "stats.lastUpdated": new Date() },
    });

    return NextResponse.json(
      {
        message: "League winner set; user and team stats.leaguesWon updated for all players and the winning team",
        data: { leagueId, winningTeamId, format, playerCount: playerIds.size },
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.message === "No token provided" || error.message === "Invalid token" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Set league winner error:", error);
    return NextResponse.json({ error: error.message || "Failed to set league winner" }, { status: 500 });
  }
}
