import { connectDB } from "@/lib/db";
import Leaderboard from "@/modules/leaderboard";
import League from "@/modules/league";
import Match from "@/modules/match";
import mongoose from "mongoose";

/**
 * Helper to convert string ID to ObjectId
 */
function toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Initialize leaderboard for a league with all teams
 * This should be called when a league is created or when teams are added
 */
export async function initializeLeaderboard(leagueId: string | mongoose.Types.ObjectId) {
  try {
    await connectDB();
    const leagueObjectId = toObjectId(leagueId);
    
    // Check if leaderboard already exists
    let leaderboard = await Leaderboard.findOne({ leagueId: leagueObjectId });
    
    const league = await League.findById(leagueObjectId);
    if (!league) {
      throw new Error("League not found");
    }

    const teams = (league as any).teams || [];
    
    if (!leaderboard) {
      // Create new leaderboard
      leaderboard = await Leaderboard.create({
        leagueId: leagueObjectId,
        teams: teams.map((teamId: any) => ({
          teamId: toObjectId(teamId),
          wins: 0,
          losses: 0,
          draws: 0,
          pointsScored: 0,
          pointsAgainst: 0,
          pointDifference: 0,
          leaguePoints: 0
        }))
      });
    } else {
      // Update existing leaderboard - add new teams that aren't already there
      const existingTeamIds = leaderboard.teams.map((t: any) => t.teamId.toString());
      const newTeams = teams.filter((teamId: any) => 
        !existingTeamIds.includes(toObjectId(teamId).toString())
      );
      
      if (newTeams.length > 0) {
        leaderboard.teams.push(...newTeams.map((teamId: any) => ({
          teamId: toObjectId(teamId),
          wins: 0,
          losses: 0,
          draws: 0,
          pointsScored: 0,
          pointsAgainst: 0,
          pointDifference: 0,
          leaguePoints: 0
        })));
        await leaderboard.save();
      }
    }
    
    return leaderboard;
  } catch (error: any) {
    console.error("Error initializing leaderboard:", error);
    throw error;
  }
}

/**
 * Add a team to leaderboard when they join a league
 */
export async function addTeamToLeaderboard(leagueId: string | mongoose.Types.ObjectId, teamId: string | mongoose.Types.ObjectId) {
  try {
    await connectDB();
    const leagueObjectId = toObjectId(leagueId);
    const teamObjectId = toObjectId(teamId);
    
    let leaderboard = await Leaderboard.findOne({ leagueId: leagueObjectId });
    
    if (!leaderboard) {
      // Initialize leaderboard if it doesn't exist
      await initializeLeaderboard(leagueId);
      leaderboard = await Leaderboard.findOne({ leagueId: leagueObjectId });
    }
    
    if (!leaderboard) {
      throw new Error("Failed to create leaderboard");
    }
    
    // Check if team already exists in leaderboard
    const existingTeam = leaderboard.teams.find((t: any) => 
      t.teamId.toString() === teamObjectId.toString()
    );
    
    if (!existingTeam) {
      // Add new team
      leaderboard.teams.push({
        teamId: teamObjectId,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsScored: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        leaguePoints: 0
      });
      await leaderboard.save();
    }
    
    return leaderboard;
  } catch (error: any) {
    console.error("Error adding team to leaderboard:", error);
    throw error;
  }
}

/**
 * Update leaderboard when a match is completed
 */
export async function updateLeaderboardFromMatch(matchId: string | mongoose.Types.ObjectId) {
  try {
    await connectDB();
    const matchObjectId = toObjectId(matchId);
    
    const match = await Match.findById(matchObjectId)
      .populate("teamA.teamId", "_id")
      .populate("teamB.teamId", "_id")
      .lean();
    
    if (!match) {
      throw new Error("Match not found");
    }
    
    const matchData = match as any;
    const leagueId = matchData.leagueId;
    const teamAId = matchData.teamA?.teamId?._id || matchData.teamA?.teamId;
    const teamBId = matchData.teamB?.teamId?._id || matchData.teamB?.teamId;
    const teamAScore = matchData.teamA?.score || 0;
    const teamBScore = matchData.teamB?.score || 0;
    
    if (!leagueId || !teamAId || !teamBId) {
      throw new Error("Match data incomplete");
    }
    
    // Get or create leaderboard
    let leaderboard = await Leaderboard.findOne({ leagueId: toObjectId(leagueId) });
    
    if (!leaderboard) {
      // Initialize leaderboard if it doesn't exist
      await initializeLeaderboard(leagueId);
      leaderboard = await Leaderboard.findOne({ leagueId: toObjectId(leagueId) });
    }
    
    if (!leaderboard) {
      throw new Error("Failed to get leaderboard");
    }
    
    const teamAObjectId = toObjectId(teamAId);
    const teamBObjectId = toObjectId(teamBId);
    
    // Find teams in leaderboard
    let teamAEntry = leaderboard.teams.find((t: any) => 
      t.teamId.toString() === teamAObjectId.toString()
    );
    let teamBEntry = leaderboard.teams.find((t: any) => 
      t.teamId.toString() === teamBObjectId.toString()
    );
    
    // Add teams if they don't exist
    if (!teamAEntry) {
      teamAEntry = {
        teamId: teamAObjectId,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsScored: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        leaguePoints: 0
      };
      leaderboard.teams.push(teamAEntry);
    }
    
    if (!teamBEntry) {
      teamBEntry = {
        teamId: teamBObjectId,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsScored: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        leaguePoints: 0
      };
      leaderboard.teams.push(teamBEntry);
    }
    
    // Update scores
    teamAEntry.pointsScored += teamAScore;
    teamAEntry.pointsAgainst += teamBScore;
    teamBEntry.pointsScored += teamBScore;
    teamBEntry.pointsAgainst += teamAScore;
    
    // Determine winner and update wins/losses/draws
    if (teamAScore > teamBScore) {
      // Team A wins
      teamAEntry.wins += 1;
      teamBEntry.losses += 1;
      teamAEntry.leaguePoints += 3; // 3 points for a win
    } else if (teamBScore > teamAScore) {
      // Team B wins
      teamBEntry.wins += 1;
      teamAEntry.losses += 1;
      teamBEntry.leaguePoints += 3; // 3 points for a win
    } else {
      // Draw
      teamAEntry.draws += 1;
      teamBEntry.draws += 1;
      // No points for draw (or 1 point each if you want to change this)
    }
    
    // Calculate point difference
    teamAEntry.pointDifference = teamAEntry.pointsScored - teamAEntry.pointsAgainst;
    teamBEntry.pointDifference = teamBEntry.pointsScored - teamBEntry.pointsAgainst;
    
    // Mark arrays as modified
    leaderboard.markModified("teams");
    await leaderboard.save();
    
    return leaderboard;
  } catch (error: any) {
    console.error("Error updating leaderboard from match:", error);
    throw error;
  }
}

/**
 * Get leaderboard for a league
 */
export async function getLeaderboard(leagueId: string | mongoose.Types.ObjectId) {
  try {
    await connectDB();
    const leagueObjectId = toObjectId(leagueId);
    
    let leaderboard = await Leaderboard.findOne({ leagueId: leagueObjectId })
      .populate("teams.teamId", "teamName enterCode image")
      .lean();
    
    if (!leaderboard) {
      // Initialize if doesn't exist
      await initializeLeaderboard(leagueId);
      leaderboard = await Leaderboard.findOne({ leagueId: leagueObjectId })
        .populate("teams.teamId", "teamName enterCode image")
        .lean();
    }
    
    if (!leaderboard) {
      throw new Error("Failed to get leaderboard");
    }
    
    // Sort teams by leaguePoints (desc), then pointDifference (desc), then pointsScored (desc)
    const sortedTeams = [...(leaderboard as any).teams].sort((a: any, b: any) => {
      // First by league points
      if (b.leaguePoints !== a.leaguePoints) {
        return b.leaguePoints - a.leaguePoints;
      }
      // Then by point difference
      if (b.pointDifference !== a.pointDifference) {
        return b.pointDifference - a.pointDifference;
      }
      // Then by points scored
      return b.pointsScored - a.pointsScored;
    });
    
    return {
      ...leaderboard,
      teams: sortedTeams
    };
  } catch (error: any) {
    console.error("Error getting leaderboard:", error);
    throw error;
  }
}

