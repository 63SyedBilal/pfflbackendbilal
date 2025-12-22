import mongoose from "mongoose";

const LeaderboardTeamSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true
    },
    wins: {
      type: Number,
      default: 0
    },

    losses: {
      type: Number,
      default: 0
    },

    draws: {
      type: Number,
      default: 0
    },

    pointsScored: {
      type: Number,
      default: 0
    },

    pointsAgainst: {
      type: Number,
      default: 0
    },

    pointDifference: {
      type: Number,
      default: 0
    },

    leaguePoints: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const LeaderboardSchema = new mongoose.Schema(
  {
    leagueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "League",
      required: true,
      unique: true
    },

    teams: [LeaderboardTeamSchema]
  },
  { timestamps: true }
);

// Prevent model overwrite in Next.js
if (mongoose.models.leaderboard) {
  delete mongoose.models.leaderboard;
}

const Leaderboard = mongoose.model("leaderboard", LeaderboardSchema);
export default Leaderboard;

