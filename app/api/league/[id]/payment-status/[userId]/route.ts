import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Payment from "@/modules/payment";
import mongoose from "mongoose";

// Helper to convert string ID to ObjectId
function toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  return new mongoose.Types.ObjectId(id);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> | { id: string; userId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const { id: leagueId, userId } = resolvedParams;

    if (!leagueId || !userId) {
      return NextResponse.json(
        { success: false, error: "League ID and User ID are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Find payment record
    const payment = await Payment.findOne({
      userId: toObjectId(userId),
      leagueId: toObjectId(leagueId),
    });

    return NextResponse.json({
      success: true,
      data: {
        isPaid: payment ? (payment.status === "paid" || payment.status === "completed") : false,
        status: payment ? payment.status : "unpaid",
        payment: payment
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error checking league payment status:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
