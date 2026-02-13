import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }, // captain

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }, // player

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },

    league: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "League",
    },

    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
    },

    type: {
      type: String,
      enum: [
        "TEAM_INVITE",
        "LEAGUE_REFEREE_INVITE",
        "LEAGUE_STATKEEPER_INVITE",
        "LEAGUE_TEAM_INVITE",
        "GAME_ASSIGNED",
        "INVITE_ACCEPTED_REFEREE",
        "INVITE_ACCEPTED_STATKEEPER",
        "INVITE_ACCEPTED_TEAM",
        "PAYMENT_COMPLETED",
        "PAYMENT_REQUIRED",
        "STATS_SUBMITTED",
        "STATS_APPROVED",
        "STATS_REJECTED",
        "SYSTEM_ALERT",
        "MESSAGE"
      ],
      default: "TEAM_INVITE"
    },

    message: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending"
    },

    format: {
      type: String,
      enum: ["5v5", "7v7"],
    }
  },
  { timestamps: true }
);

// Force delete the model from mongoose if it exists to ensure schema updates are applied
if (mongoose.models.Notification) {
  delete mongoose.models.Notification;
}

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;

