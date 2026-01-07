import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/modules/user";
import { verifyAccessToken } from "@/lib/jwt";

// Helper to get token from request
function getToken(req: NextRequest): string | null {
    const authHeader = req.headers.get("authorization");
    return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

// Helper to verify user from token
async function verifyUserToken(req: NextRequest) {
    const token = getToken(req);
    if (!token) throw new Error("No token provided");
    return verifyAccessToken(token);
}

export async function PUT(req: NextRequest) {
    try {
        await connectDB();
        const decoded = await verifyUserToken(req);
        const userId = decoded.userId;

        const body: any = await req.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: "Current and new password are required" },
                { status: 400 }
            );
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: "New password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        // Find user and explicitly select password which is excluded by default
        const user = await User.findById(userId).select("+password");

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Verify current password
        // Use the method defined in User schema if available, or manual comparison if needed.
        // The schema in modules/user.ts defines comparePassword method.
        // Type casting to any because TypeScript might not know about schema methods on the model instance directly without interface
        const isMatch = await (user as any).comparePassword(currentPassword);

        if (!isMatch) {
            return NextResponse.json(
                { error: "Incorrect current password" },
                { status: 401 }
            );
        }

        // Update password
        user.password = newPassword;

        // Save user - pre-save hook will hash the password
        await user.save();

        return NextResponse.json(
            { message: "Password updated successfully" },
            { status: 200 }
        );
    } catch (error: any) {
        if (error.message === "No token provided" || error.message === "Invalid token") {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        console.error("Change password error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update password" },
            { status: 500 }
        );
    }
}
