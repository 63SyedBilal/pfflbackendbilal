import mongoose from "mongoose";

export const LeagueSchema = new mongoose.Schema(
  {
    leagueName: {
      type: String,
      required: true,
      trim: true,
    },

    logo: {
      type: String,
      default: "",
    },

    format: {
      type: String,
      enum: ["5v5", "7v7"],
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    minimumPlayers: {
      type: Number,
      required: true,
    },

    entryFeeType: {
      type: String,
      enum: ["stripe", "paypal"], // updated
      required: true,
    },

    perPlayerLeagueFee: {
      type: Number,
      default: 0,
    },

    referees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    statKeepers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],

    status: {
      type: String,
      enum: ["active", "pending"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const League = mongoose.models.League || mongoose.model("League", LeagueSchema);

export default League;

