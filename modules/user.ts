import mongoose from "mongoose";
import { hashPassword, verifyPassword } from "@/lib/auth";

/**
 * OverallPlayerStatsSchema - Cumulative stats across all matches for a player
 * This mirrors PlayerStatsSchema but is embedded in User (not Match)
 * Example: Player has played 3 matches with stats [3 TDs, 2 TD, 5 TD] → Overall: 10 TDs
 */
const OverallPlayerStatsSchema = new mongoose.Schema(
  {
    // Offensive - cumulative across all matches
    catches: { type: Number, default: 0 },
    catchYards: { type: Number, default: 0 },
    rushes: { type: Number, default: 0 },
    rushYards: { type: Number, default: 0 },
    passAttempts: { type: Number, default: 0 },
    passYards: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    touchdowns: { type: Number, default: 0 },
    conversionPoints: { type: Number, default: 0 },

    // Defensive / misc - cumulative across all matches
    safeties: { type: Number, default: 0 },
    flagPull: { type: Number, default: 0 },
    sack: { type: Number, default: 0 },
    interceptions: { type: Number, default: 0 },

    // Calculated - sum of all match performances
    totalPoints: { type: Number, default: 0 },

    // Metadata
    matchesPlayed: { type: Number, default: 0 },          // total matches/games played
    leaguesPlayed: { type: Number, default: 0 },          // total distinct leagues player participated in
    gamesWon5v5: { type: Number, default: 0 },            // total 5v5 games won
    gamesWon7v7: { type: Number, default: 0 },            // total 7v7 games won
    leaguesWon5v5: { type: Number, default: 0 },          // total 5v5 league titles won
    leaguesWon7v7: { type: Number, default: 0 },          // total 7v7 league titles won
    lastUpdated: { type: Date, default: Date.now }        // When stats were last updated
  },
  { _id: false }
);

export const UserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      default: "",
      trim: true,
    },
    lastName: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      default: undefined,
    },
    password: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["player", "captain", "referee", "stat-keeper", "free-agent", "superadmin"],
      default: "free-agent",
    },
    // Profile fields - stored directly in User instead of separate Profile collection
    profileImage: {
      type: String,
      default: "",
    },
    position: {
      type: String,
      default: "",
    },
    jerseyNumber: {
      type: Number,
      default: null,
    },
    emergencyContactName: {
      type: String,
      default: "",
    },
    emergencyPhone: {
      type: String,
      default: "",
    },
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    totalPoints: {
      type: Number,
      default: 0
    },

    /**
     * Overall career stats - cumulative across all matches
     * Updated atomically when Stat Keeper updates match stats
     * Examples:
     *   Match 1: player has {td: 3, catches: 4} → User.stats = {td: 3, catches: 4}
     *   Match 2: player has {td: 4, catches: 1} → User.stats = {td: 7, catches: 5}
     *   Match 3: player has {td: 2, catches: 3} → User.stats = {td: 9, catches: 8}
     */
    stats: {
      type: OverallPlayerStatsSchema,
      default: () => ({})
    },
  },
  { timestamps: true }
);
UserSchema.pre("save", function () {
  if (this.phone === "" || this.phone === null) {
    this.phone = undefined;
  }
});

// Hash password before saving (only if password is provided)
UserSchema.pre("save", async function () {
  if (this.isModified("password") && this.password) {
    try {
      // Only hash if password is not already hashed (doesn't start with $2a$ or $2b$)
      if (!this.password.startsWith("$2a$") && !this.password.startsWith("$2b$")) {
        console.log("🔐 Hashing password for user:", this.email);
        this.password = await hashPassword(this.password);
        console.log("✅ Password hashed successfully");
      } else {
        console.log("🔐 Password already hashed, skipping");
      }
    } catch (error) {
      console.error("❌ Error hashing password:", error);
      throw error;
    }
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function (candidatePassword: string) {
  if (!this.password) {
    return false;
  }
  return verifyPassword(candidatePassword, this.password);
};

// Prevent model overwrite error in Next.js development
// Use existing model if available, otherwise create new one
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
