import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Notification from "@/modules/notification";
import Team from "@/modules/team";
import User from "@/modules/user";
import League from "@/modules/league";
import SuperAdmin from "@/modules/superadmin";
import Match from "@/modules/match";
import { verifyAccessToken } from "@/lib/jwt";
import mongoose from "mongoose";
import { addTeamToLeaderboard } from "./leaderboard";

// Helper to get token from request
function getToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

// Helper to verify user from token
async function verifyUserToken(req: NextRequest) {
  const token = getToken(req);
  if (!token) throw new Error("No token provided");

  const decoded = verifyAccessToken(token);
  return decoded;
}

/**
 * Captain sends invite to player
 * POST /api/team/invite-player
 */
export async function invitePlayer(req: NextRequest) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);

    const body: any = await req.json();
    const { playerId, teamId, format } = body;

    if (!playerId || !teamId || !format) {
      return NextResponse.json(
        { error: "playerId, teamId, and format are required" },
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

    // Verify user is a captain
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "captain") {
      return NextResponse.json(
        { error: "Only captains can send invites" },
        { status: 403 }
      );
    }

    // Verify team exists and belongs to this captain
    const team = await Team.findById(teamId);
    if (!team) {
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404 }
      );
    }

    if (team.captain.toString() !== decoded.userId) {
      return NextResponse.json(
        { error: "You can only invite players to your own team" },
        { status: 403 }
      );
    }

    // Validate: captain cannot invite himself
    if (playerId === decoded.userId) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      );
    }

    // Verify player exists
    const player = await User.findById(playerId);
    if (!player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 }
      );
    }

    // Validate: player cannot join same squad twice
    const squadField = format === "5v5" ? "squad5v5" : "squad7v7";
    const squad = (team as any)[squadField];
    if (squad && squad.includes(playerId)) {
      return NextResponse.json(
        { error: `Player is already in the ${format} squad for this team` },
        { status: 400 }
      );
    }

    // Convert IDs to ObjectIds
    const senderId = new mongoose.Types.ObjectId(decoded.userId);
    const receiverId = new mongoose.Types.ObjectId(playerId);
    const teamObjectId = new mongoose.Types.ObjectId(teamId);

    // Check if there's already a pending invite for this format
    const existingNotification = await Notification.findOne({
      sender: senderId,
      receiver: receiverId,
      team: teamObjectId,
      format: format,
      status: "pending"
    });

    if (existingNotification) {
      return NextResponse.json(
        { error: `Invite already sent to this player for ${format} format` },
        { status: 409 }
      );
    }

    // Create notification with format using ObjectIds
    const notification = await Notification.create({
      sender: senderId,
      receiver: receiverId,
      team: teamObjectId,
      type: "TEAM_INVITE",
      status: "pending",
      format: format
    });

    // Populate sender and team
    await notification.populate("sender", "firstName lastName email");
    await notification.populate("team", "teamName");
    await notification.populate("receiver", "firstName lastName email");

    return NextResponse.json(
      {
        message: "Invite sent successfully",
        data: notification
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in invitePlayer:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to send invite" },
      { status: 500 }
    );
  }
}

/**
 * Get all notifications for logged-in user
 * GET /api/notification/all
 */
export async function getAllNotifications(req: NextRequest) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);

    console.log("Getting notifications for user:", decoded.userId);

    // Try both string and ObjectId matching
    const userId = decoded.userId.toString();
    const notifications = await Notification.find({
      $or: [
        { receiver: userId },
        { receiver: decoded.userId }
      ],
      status: "pending"
    })
      .populate({
        path: "sender",
        select: "firstName lastName email",
        model: "User"
      })
      .populate({
        path: "team",
        select: "teamName image",
        model: "Team"
      })
      .populate({
        path: "league",
        select: "leagueName logo",
        model: "League"
      })
      .populate({
        path: "receiver",
        select: "firstName lastName email",
        model: "User"
      })
      .sort({ createdAt: -1 });

    console.log(`Found ${notifications.length} notifications for user ${userId}`);
    console.log("Notification types:", notifications.map((n: any) => ({
      type: n.type,
      receiver: n.receiver?.toString() || n.receiver,
      sender: n.sender && typeof n.sender === 'object' && 'firstName' in n.sender
        ? `${n.sender.firstName} ${n.sender.lastName}`
        : "null",
      league: n.league && typeof n.league === 'object' && 'leagueName' in n.league
        ? n.league.leagueName
        : "null",
      team: n.team && typeof n.team === 'object' && 'teamName' in n.team
        ? n.team.teamName
        : "null"
    })));

    return NextResponse.json(
      {
        message: "Notifications retrieved successfully",
        data: notifications
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in getAllNotifications:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to get notifications" },
      { status: 500 }
    );
  }
}

/**
 * Player accepts invite
 * PUT /api/notification/accept/:notifId
 */
export async function acceptInvite(req: NextRequest, { params }: { params: { notifId: string } }) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);

    const { notifId } = params;

    console.log("Accept invite - Notification ID:", notifId);
    console.log("Accept invite - User ID:", decoded.userId);

    // Find notification
    const notification = await Notification.findById(notifId);

    if (!notification) {
      console.error("Notification not found with ID:", notifId);
      // Try to find all notifications to debug
      const allNotifications = await Notification.find({ receiver: decoded.userId }).limit(5);
      console.log("User's notifications:", allNotifications.map(n => ({ id: n._id.toString(), receiver: n.receiver.toString() })));
      return NextResponse.json(
        { error: "Notification not found", debug: { notifId, userId: decoded.userId } },
        { status: 404 }
      );
    }

    console.log("Notification found:", notification._id.toString());

    // Verify the notification belongs to the logged-in user
    const receiverId = notification.receiver.toString();
    const userId = decoded.userId.toString();

    console.log("Receiver ID:", receiverId);
    console.log("User ID:", userId);

    if (receiverId !== userId) {
      return NextResponse.json(
        { error: "You can only accept your own invites" },
        { status: 403 }
      );
    }

    // Check if notification is still pending
    if (notification.status !== "pending") {
      return NextResponse.json(
        { error: "This invite has already been " + notification.status },
        { status: 400 }
      );
    }

    const notificationType = notification.type;

    // Handle TEAM_INVITE
    if (notificationType === "TEAM_INVITE") {
      if (!notification.team) {
        return NextResponse.json(
          { error: "Team ID is missing in the notification" },
          { status: 400 }
        );
      }
      // Get team - notification.team might be ObjectId or populated object
      const teamId = notification.team.toString();
      const team = await Team.findById(teamId);

      if (!team) {
        console.error("Team not found with ID:", teamId);
        return NextResponse.json(
          { error: "Team not found" },
          { status: 404 }
        );
      }

      console.log("Team found:", team._id.toString());

      // Get the format from notification
      const format = notification.format;
      if (!format || !["5v5", "7v7"].includes(format)) {
        return NextResponse.json(
          { error: "Invalid format in notification" },
          { status: 400 }
        );
      }

      // Check if player is already in the squad for this format
      const playerIdString = decoded.userId.toString();
      const squadField = format === "5v5" ? "squad5v5" : "squad7v7";
      const squadPlayers = (team as any)[squadField].map((p: any) => p.toString());

      if (squadPlayers.includes(playerIdString)) {
        return NextResponse.json(
          { error: `You are already in the ${format} squad for this team` },
          { status: 400 }
        );
      }

      // Get the user to check if they're a free-agent
      const user = await User.findById(decoded.userId);
      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Track if role was changed
      const wasFreeAgent = user.role === "free-agent";

      // If user is a free-agent, change their role to player
      if (wasFreeAgent) {
        console.log(`🔄 Changing user role from free-agent to player for user: ${user.email}`);
        user.role = "player";
        await user.save();
        console.log(`✅ User role updated to player`);
      }

      // Update notification status
      notification.status = "accepted";
      await notification.save();

      // Add player to the correct squad using $addToSet to prevent duplicates
      const updateQuery: any = {};
      updateQuery[`$addToSet`] = { [squadField]: decoded.userId };

      const updatedTeam = await Team.findByIdAndUpdate(
        teamId,
        updateQuery,
        { new: true }
      );

      if (!updatedTeam) {
        console.error("Failed to update team");
        return NextResponse.json(
          { error: "Failed to add player to squad" },
          { status: 500 }
        );
      }

      console.log(`${format} squad after:`, (updatedTeam as any)[squadField].map((p: any) => p.toString()));

      // Populate for response
      await notification.populate("sender", "firstName lastName email");
      await notification.populate("team", "teamName image");
      await notification.populate("receiver", "firstName lastName email");

      // 🔔 Notify captain that player accepted
      try {
        await Notification.create({
          sender: notification.receiver,
          receiver: notification.sender,
          team: notification.team,
          type: "INVITE_ACCEPTED_TEAM",
          status: "accepted",
          message: `${(user as any).firstName} ${(user as any).lastName} has accepted your invite to join ${team.teamName}.`
        });
      } catch (e) {
        console.error("Error notifying captain:", e);
      }

      const roleChangeMessage = wasFreeAgent
        ? " Your role has been updated from free-agent to player."
        : "";

      return NextResponse.json(
        {
          message: `Invite accepted successfully. You have been added to the team.${roleChangeMessage}`,
          data: notification
        },
        { status: 200 }
      );
    }

    // Handle LEAGUE_REFEREE_INVITE
    if (notificationType === "LEAGUE_REFEREE_INVITE") {
      if (!notification.league) {
        return NextResponse.json(
          { error: "League ID is missing in the notification" },
          { status: 400 }
        );
      }
      const leagueId = notification.league.toString();
      const league = await League.findById(leagueId);

      if (!league) {
        return NextResponse.json(
          { error: "League not found" },
          { status: 404 }
        );
      }

      const refereeId = decoded.userId.toString();
      const referees = (league as any).referees || [];

      if (referees.some((r: any) => r.toString() === refereeId)) {
        return NextResponse.json(
          { error: "You are already a referee in this league" },
          { status: 400 }
        );
      }

      // Update notification status
      notification.status = "accepted";
      await notification.save();

      // Add referee to league
      (league as any).referees.push(decoded.userId);
      await league.save();

      await notification.populate("sender", "firstName lastName email");
      await notification.populate("league", "leagueName");
      await notification.populate("receiver", "firstName lastName email");

      return NextResponse.json(
        {
          message: "Invite accepted successfully. You have been added as a referee to the league.",
          data: notification
        },
        { status: 200 }
      );
    }

    // Handle LEAGUE_STATKEEPER_INVITE
    if (notificationType === "LEAGUE_STATKEEPER_INVITE") {
      if (!notification.league) {
        return NextResponse.json(
          { error: "League ID is missing in the notification" },
          { status: 400 }
        );
      }
      const leagueId = notification.league.toString();
      const league = await League.findById(leagueId);

      if (!league) {
        return NextResponse.json(
          { error: "League not found" },
          { status: 404 }
        );
      }

      const statKeeperId = decoded.userId.toString();
      const statKeepers = (league as any).statKeepers || [];

      if (statKeepers.some((sk: any) => sk.toString() === statKeeperId)) {
        return NextResponse.json(
          { error: "You are already a stat keeper in this league" },
          { status: 400 }
        );
      }

      // Update notification status
      notification.status = "accepted";
      await notification.save();

      // Add stat keeper to league
      (league as any).statKeepers.push(decoded.userId);
      await league.save();

      await notification.populate("sender", "firstName lastName email");
      await notification.populate("league", "leagueName");
      await notification.populate("receiver", "firstName lastName email");

      return NextResponse.json(
        {
          message: "Invite accepted successfully. You have been added as a stat keeper to the league.",
          data: notification
        },
        { status: 200 }
      );
    }

    // Handle LEAGUE_TEAM_INVITE
    if (notificationType === "LEAGUE_TEAM_INVITE") {
      console.log("🔵 ========== LEAGUE_TEAM_INVITE ACCEPTANCE START ==========");
      console.log("🔵 Notification ID:", notification._id);
      console.log("🔵 Notification Type:", notificationType);

      if (!notification.league) {
        return NextResponse.json(
          { error: "League ID is missing in the notification" },
          { status: 400 }
        );
      }
      const leagueId = notification.league.toString();
      console.log("🔵 League ID (raw):", notification.league);
      console.log("🔵 League ID (processed):", leagueId);

      const league = await League.findById(leagueId);
      console.log("🔵 League found:", league ? "YES" : "NO");

      if (!league) {
        console.error("❌ League not found with ID:", leagueId);
        return NextResponse.json(
          { error: "League not found" },
          { status: 404 }
        );
      }

      console.log("🔵 League Name:", (league as any).leagueName);
      console.log("🔵 League Fee:", (league as any).perPlayerLeagueFee);

      if (!notification.team) {
        return NextResponse.json(
          { error: "Team ID is missing in the notification" },
          { status: 400 }
        );
      }
      const teamId = notification.team.toString();
      console.log("🔵 Team ID (raw):", notification.team);
      console.log("🔵 Team ID (processed):", teamId);

      const team = await Team.findById(teamId);
      console.log("🔵 Team found:", team ? "YES" : "NO");

      if (!team) {
        console.error("❌ Team not found with ID:", teamId);
        return NextResponse.json(
          { error: "Team not found" },
          { status: 404 }
        );
      }

      console.log("🔵 Team Name:", team.teamName);
      console.log("🔵 Team Captain ID:", team.captain);
      console.log("🔵 Decoded User ID:", decoded.userId);

      // Verify user is the captain of the team
      if (team.captain.toString() !== decoded.userId) {
        console.error("❌ User is not the captain. Team captain:", team.captain.toString(), "User:", decoded.userId);
        return NextResponse.json(
          { error: "Only the team captain can accept league invitations" },
          { status: 403 }
        );
      }

      console.log("✅ User is the captain - proceeding");

      const teams = (league as any).teams || [];
      console.log("🔵 Current teams in league:", teams.length);

      if (teams.some((t: any) => t.toString() === teamId)) {
        console.error("❌ Team already in league");
        return NextResponse.json(
          { error: "Team is already in this league" },
          { status: 400 }
        );
      }

      // Add team to league
      console.log("🔵 Adding team to league...");
      (league as any).teams.push(teamId);
      await league.save();
      console.log("✅ Team added to league successfully");

      // Add team to leaderboard
      try {
        await addTeamToLeaderboard(leagueId, teamId);
        console.log("✅ Team added to leaderboard successfully");
      } catch (leaderboardError: any) {
        console.error("Error adding team to leaderboard:", leaderboardError);
        // Don't fail the invite acceptance if leaderboard update fails
      }

      // Create payment records for all players in the team (including captain)
      // Only create payments for players and captains, not referees/stat-keepers
      console.log("🔵 ========== PAYMENT CREATION START ==========");
      try {
        // Import createPayment function
        console.log("🔵 Importing createPayment function...");
        const { createPayment } = await import("@/controller/payment");
        console.log("✅ createPayment imported successfully");

        // Helper to convert string ID to ObjectId
        const toObjectId = (id: string | any): mongoose.Types.ObjectId => {
          if (id instanceof mongoose.Types.ObjectId) {
            return id;
          }
          if (typeof id === 'string') {
            return new mongoose.Types.ObjectId(id);
          }
          return new mongoose.Types.ObjectId(id.toString());
        };

        // Get all unique player IDs from both squads
        console.log("🔵 Getting player IDs from squads...");
        console.log("🔵 squad5v5 (raw):", team.squad5v5);
        console.log("🔵 squad7v7 (raw):", team.squad7v7);
        console.log("🔵 captain (raw):", team.captain);

        const squad5v5Ids = (team.squad5v5 || []).map((id: any) => {
          if (id?.toString) return id.toString();
          if (id instanceof mongoose.Types.ObjectId) return id.toString();
          return String(id);
        });
        const squad7v7Ids = (team.squad7v7 || []).map((id: any) => {
          if (id?.toString) return id.toString();
          if (id instanceof mongoose.Types.ObjectId) return id.toString();
          return String(id);
        });
        const captainId = team.captain?.toString ? team.captain.toString() : String(team.captain);

        console.log("🔵 squad5v5 IDs:", squad5v5Ids);
        console.log("🔵 squad7v7 IDs:", squad7v7Ids);
        console.log("🔵 captain ID:", captainId);

        // Combine all player IDs (including captain) and remove duplicates
        const allPlayerIds = [...new Set([...squad5v5Ids, ...squad7v7Ids, captainId])];

        console.log(`💰 ========== PAYMENT CREATION FOR ${allPlayerIds.length} PLAYERS ==========`);
        console.log(`💰 Team Name: ${team.teamName}`);
        console.log(`💰 League Name: ${(league as any).leagueName}`);
        console.log(`💰 League ID: ${leagueId}`);
        console.log(`💰 Team ID: ${teamId}`);
        console.log(`💰 League Fee: $${(league as any).perPlayerLeagueFee}`);
        console.log(`💰 All Player IDs (${allPlayerIds.length}):`, allPlayerIds);

        // Create payment for each player
        console.log(`💰 Starting payment creation for ${allPlayerIds.length} players...`);
        const paymentPromises = allPlayerIds.map(async (playerIdStr: string, index: number) => {
          console.log(`\n💰 [${index + 1}/${allPlayerIds.length}] Processing player ID: ${playerIdStr}`);
          try {
            const playerId = toObjectId(playerIdStr);
            const leagueObjectId = toObjectId(leagueId);
            const teamObjectId = toObjectId(teamId);

            console.log(`💰 [${index + 1}] Converted IDs:`);
            console.log(`   - Player ID: ${playerId.toString()}`);
            console.log(`   - League ID: ${leagueObjectId.toString()}`);
            console.log(`   - Team ID: ${teamObjectId.toString()}`);

            // Get user to check role
            console.log(`💰 [${index + 1}] Looking up user in database...`);
            const player = await User.findById(playerId);
            if (!player) {
              console.error(`❌ [${index + 1}] Player not found in database: ${playerIdStr}`);
              return null;
            }

            console.log(`💰 [${index + 1}] User found:`);
            console.log(`   - Email: ${player.email}`);
            console.log(`   - Role: ${player.role}`);
            console.log(`   - Name: ${player.firstName} ${player.lastName}`);
            console.log(`   - User ID: ${player._id}`);

            // Only create payment for players and captains, skip referees and stat-keepers
            if (player.role !== "player" && player.role !== "captain" && player.role !== "free-agent") {
              console.log(`⏭️ [${index + 1}] Skipping payment for ${player.email} (role: ${player.role} - not eligible)`);
              return null;
            }

            // Create payment
            console.log(`💰 [${index + 1}] Calling createPayment function...`);
            console.log(`   - userId: ${playerId.toString()}`);
            console.log(`   - leagueId: ${leagueObjectId.toString()}`);
            console.log(`   - teamId: ${teamObjectId.toString()}`);

            const payment = await createPayment(playerId, leagueObjectId, teamObjectId);

            console.log(`✅ [${index + 1}] Payment created successfully!`);
            console.log(`   - Payment ID: ${payment._id}`);
            console.log(`   - Amount: $${payment.amount}`);
            console.log(`   - Status: ${payment.status}`);
            console.log(`   - User: ${player.firstName} ${player.lastName} (${player.email})`);
            console.log(`   - League: ${(league as any).leagueName}`);
            console.log(`   - Team: ${team.teamName}`);

            return payment;
          } catch (error: any) {
            console.error(`❌ [${index + 1}] ERROR creating payment for player ${playerIdStr}:`);
            console.error(`   - Error message: ${error.message}`);
            console.error(`   - Error stack: ${error.stack}`);
            if (error.response) {
              console.error(`   - Error response:`, error.response);
            }
            return null;
          }
        });

        // Wait for all payments to be created (don't fail if some fail)
        console.log(`💰 Waiting for all payment promises to complete...`);
        const results = await Promise.allSettled(paymentPromises);

        console.log(`\n💰 ========== PAYMENT CREATION RESULTS ==========`);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;
        const rejected = results.filter(r => r.status === 'rejected').length;

        console.log(`💰 Total players processed: ${allPlayerIds.length}`);
        console.log(`✅ Successful payments: ${successful}`);
        console.log(`❌ Failed/Skipped: ${failed}`);
        console.log(`💥 Rejected promises: ${rejected}`);

        // Log details of each result
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value !== null) {
            console.log(`✅ [${index + 1}] Payment created: ${result.value._id}`);
          } else if (result.status === 'fulfilled' && result.value === null) {
            console.log(`⏭️ [${index + 1}] Payment skipped (player not eligible or not found)`);
          } else if (result.status === 'rejected') {
            console.error(`❌ [${index + 1}] Payment promise rejected:`, result.reason);
          }
        });

        console.log(`💰 ========== PAYMENT CREATION COMPLETE ==========\n`);
      } catch (paymentError: any) {
        // Log error but don't fail the invitation acceptance
        console.error("❌ ========== PAYMENT CREATION ERROR ==========");
        console.error("❌ Error type:", paymentError.constructor.name);
        console.error("❌ Error message:", paymentError.message);
        console.error("❌ Error stack:", paymentError.stack);
        if (paymentError.cause) {
          console.error("❌ Error cause:", paymentError.cause);
        }
        console.error("❌ ============================================\n");
      }

      // Update notification status
      notification.status = "accepted";
      await notification.save();

      await notification.populate("sender", "firstName lastName email");
      await notification.populate("league", "leagueName");
      await notification.populate("team", "teamName");
      await notification.populate("receiver", "firstName lastName email");

      // 🔔 Notify superadmins that team joined league
      try {
        const superAdmins = await User.find({ role: "superadmin" });
        for (const admin of superAdmins) {
          await Notification.create({
            sender: notification.receiver,
            receiver: admin._id,
            league: notification.league,
            team: notification.team,
            type: "INVITE_ACCEPTED_TEAM",
            status: "accepted",
            message: `Team ${team.teamName} has accepted the invitation to join league: ${(league as any).leagueName}`
          });
        }
      } catch (e) {
        console.error("Error notifying admins:", e);
      }

      return NextResponse.json(
        {
          message: "Invite accepted successfully. Your team has been added to the league. Payment records have been created for all team members.",
          data: notification
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Unknown notification type" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error in acceptInvite:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to accept invite" },
      { status: 500 }
    );
  }
}

/**
 * Player rejects invite
 * PUT /api/notification/reject/:notifId
 */
export async function rejectInvite(req: NextRequest, { params }: { params: { notifId: string } }) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);

    const { notifId } = params;

    // Find notification
    const notification = await Notification.findById(notifId);
    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Verify the notification belongs to the logged-in user
    if (notification.receiver.toString() !== decoded.userId) {
      return NextResponse.json(
        { error: "You can only reject your own invites" },
        { status: 403 }
      );
    }

    // Check if notification is still pending
    if (notification.status !== "pending") {
      return NextResponse.json(
        { error: "This invite has already been " + notification.status },
        { status: 400 }
      );
    }

    // Handle LEAGUE_TEAM_INVITE rejection
    // Note: Team is not added to league until accepted, so no need to remove on rejection
    if (notification.type === "LEAGUE_TEAM_INVITE") {
      console.log("🔴 League team invitation rejected - team was not added to league");
    }

    // Update notification status
    notification.status = "rejected";
    await notification.save();

    // Populate for response
    await notification.populate("sender", "firstName lastName email");
    if (notification.team) {
      await notification.populate("team", "teamName image");
    }
    if (notification.league) {
      await notification.populate("league", "leagueName");
    }
    await notification.populate("receiver", "firstName lastName email");

    return NextResponse.json(
      {
        message: "Invite rejected successfully",
        data: notification
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in rejectInvite:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to reject invite" },
      { status: 500 }
    );
  }
}


/**
 * Send a general notification
 * POST /api/notification/send
 */
export async function sendGeneralNotification(req: NextRequest) {
  try {
    await connectDB();
    const decoded = await verifyUserToken(req);

    const body: any = await req.json();
    const { receiverId, type, message, isAdmin, leagueId, teamId, matchId } = body;

    if (!message || (!receiverId && !isAdmin)) {
      return NextResponse.json(
        { error: "Message and either receiverId or isAdmin are required" },
        { status: 400 }
      );
    }

    const senderId = new mongoose.Types.ObjectId(decoded.userId);
    let results = [];

    if (isAdmin) {
      // 1. Find Admins from User collection
      const userAdmins = await User.find({
        role: { $in: ["superadmin", "admin"] }
      });

      // 2. Find Admins from SuperAdmin collection
      const superAdmins = await SuperAdmin.find({});

      // Combine unique IDs
      const adminIds = new Set<string>();
      userAdmins.forEach(a => adminIds.add(a._id.toString()));
      superAdmins.forEach(a => adminIds.add(a._id.toString()));

      for (const adminId of adminIds) {
        const notif = await Notification.create({
          sender: senderId,
          receiver: new mongoose.Types.ObjectId(adminId),
          type: type || "SYSTEM_ALERT",
          message: message,
          league: leagueId ? new mongoose.Types.ObjectId(leagueId) : undefined,
          team: teamId ? new mongoose.Types.ObjectId(teamId) : undefined,
          match: matchId ? new mongoose.Types.ObjectId(matchId) : undefined,
          status: "pending"
        });
        results.push(notif);
      }
    } else {
      // Send to specific receiver
      const notif = await Notification.create({
        sender: senderId,
        receiver: receiverId ? new mongoose.Types.ObjectId(receiverId) : undefined,
        type: type || "MESSAGE",
        message: message,
        league: leagueId ? new mongoose.Types.ObjectId(leagueId) : undefined,
        team: teamId ? new mongoose.Types.ObjectId(teamId) : undefined,
        match: matchId ? new mongoose.Types.ObjectId(matchId) : undefined,
        status: "pending"
      });
      results.push(notif);
    }

    return NextResponse.json(
      {
        message: "Notification(s) sent successfully",
        count: results.length
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in sendGeneralNotification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}


