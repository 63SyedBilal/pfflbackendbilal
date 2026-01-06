import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Team, User, Payment } from "@/modules";
import { verifyAccessToken } from "@/lib/jwt";

/**
 * Get payment statuses for all players in a team
 * GET /api/team/:id/player-payments
 */
export async function GET(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        await verifyAccessToken(req.headers.get("authorization")?.substring(7) || "");

        const params = await props.params;
        const teamId = params.id;
        if (!teamId) {
            return NextResponse.json({ error: "Team ID required" }, { status: 400 });
        }

        const team = await Team.findById(teamId);
        if (!team) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        // Get all players in the team
        const playerIds = team.players;

        // Get league ID from team
        const leagueId = (team as any).league;

        // Map to store payment status per player
        const paymentStatuses: Record<string, boolean> = {};

        if (!leagueId) {
            // If team not in league, no one has paid league fees
            for (const pid of playerIds) {
                paymentStatuses[pid.toString()] = false;
            }
        } else {
            // Find all successful payments for this league by these players
            const payments = await Payment.find({
                league: leagueId,
                user: { $in: playerIds },
                status: 'paid' // or 'completed' depending on payment implementation
            });

            // Populate map
            playerIds.forEach((pid: any) => {
                paymentStatuses[pid.toString()] = payments.some(
                    p => p.user.toString() === pid.toString()
                );
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                teamId,
                leagueId,
                paymentStatuses
            }
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error fetching player payments:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch payment statuses" },
            { status: 500 }
        );
    }
}
