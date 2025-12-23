import mongoose from "mongoose";

export async function GET() {
  const dbState = mongoose.connection.readyState;

  return Response.json({
    status: "ok",
    server: "running",
    database:
      dbState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
}

