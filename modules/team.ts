import mongoose from "mongoose";

/**
 * OverallTeamStatsSchema - cumulative team statistics across matches
 * Embedded in Team document as `stats` for quick access (league-level/overall)
 */
const OverallTeamStatsSchema = new mongoose.Schema(
  {
    
    catches: { type: Number, default: 0 },
    catchYards: { type: Number, default: 0 },
    rushes: { type: Number, default: 0 },
    rushYards: { type: Number, default: 0 },
    passAttempts: { type: Number, default: 0 },
    passYards: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    touchdowns: { type: Number, default: 0 },
    conversionPoints: { type: Number, default: 0 },

  
    safeties: { type: Number, default: 0 },
    flagPull: { type: Number, default: 0 },
    sack: { type: Number, default: 0 },
    interceptions: { type: Number, default: 0 },

    // Calculated / metadata
    totalPoints: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },        // total matches/games played
    leaguesPlayed: { type: Number, default: 0 },        // total distinct leagues the team played in
    gamesWon5v5: { type: Number, default: 0 },          // total 5v5 games won
    gamesWon7v7: { type: Number, default: 0 },          // total 7v7 games won
    leaguesWon5v5: { type: Number, default: 0 },        // total 5v5 league titles won
    leaguesWon7v7: { type: Number, default: 0 },        // total 7v7 league titles won
    lastUpdated: { type: Date, default: Date.now }
  },
  { _id: false }
);

export const TeamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      trim: true
    },

    enterCode: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allow multiple null/undefined values
      trim: true
    },

    location: {
      type: String,
      required: true,
      trim: true
    },

    skillLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "professional"],
      default: "beginner"
    },

    image: {
      type: String, // cloudinary URL
      default: ""
    },

    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    squad5v5: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    squad7v7: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    // Overall cumulative team stats (across all matches)
    stats: {
      type: OverallTeamStatsSchema,
      default: () => ({})
    },

    players: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  { timestamps: true }
);

// Virtual to get all unique players from both squads
TeamSchema.virtual("allPlayers").get(function () {
  const squad5v5Ids = (this.squad5v5 || []).map((id: any) => id.toString())
  const squad7v7Ids = (this.squad7v7 || []).map((id: any) => id.toString())
  const allIds = [...new Set([...squad5v5Ids, ...squad7v7Ids])]
  return allIds
})

// Middleware to automatically update players array when squads change
TeamSchema.pre("save", async function () {
  try {
    const squad5v5Ids = (this.squad5v5 || []).map((id: any) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return id.toString()
      }
      return id
    })
    const squad7v7Ids = (this.squad7v7 || []).map((id: any) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return id.toString()
      }
      return id
    })
    const allUniqueIds = [...new Set([...squad5v5Ids, ...squad7v7Ids])]

    // Convert back to ObjectIds
    this.players = allUniqueIds
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
      .map((id: string) => new mongoose.Types.ObjectId(id))
  } catch (error) {
    // If error, just set empty array
    this.players = []
  }
})

const Team = mongoose.models.Team || mongoose.model("Team", TeamSchema);

export default Team;

