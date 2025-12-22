import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/controller/leaderboard";
import { verifyAccessToken } from "@/lib/jwt";

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
 * Get leaderboard for a league
 * GET /api/leaderboard/:leagueId
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> | { leagueId: string } }
) {
  try {
    await verifyUser(req);
    
    const resolvedParams = await Promise.resolve(params);
    const { leagueId } = resolvedParams;
    
    if (!leagueId) {
      return NextResponse.json(
        { error: "League ID is required" },
        { status: 400 }
      );
    }

    const leaderboard = await getLeaderboard(leagueId);

    return NextResponse.json(
      {
        message: "Leaderboard retrieved successfully",
        data: leaderboard,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get leaderboard error:", error);
    if (error.message === "No token provided" || error.message === "Invalid token") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to get leaderboard" },
      { status: 500 }
    );
  }
}

