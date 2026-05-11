import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/modules";
import { verifyAccessToken } from "@/lib/jwt";

/** Default temporary password after superadmin reset (hashed on save via User pre-save). */
const DEFAULT_RESET_PASSWORD = "123456";

function getToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
}

// CORS headers helper
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

/**
 * Superadmin-only: reset a regular user's password to the default temporary password.
 * POST /api/admin/update-user-password
 * Headers: Authorization: Bearer <superadmin_jwt>
 * Body: { "email": "user@example.com" } OR { "userId": "<mongo_id>" }
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const token = getToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "No token provided" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    if (decoded.role !== "superadmin") {
      return NextResponse.json(
        { error: "Only superadmin can reset user passwords" },
        { status: 403, headers: getCorsHeaders() }
      );
    }

    const body = await req.json();
    const { email, userId } = body as { email?: string; userId?: string };

    let user = null;
    if (userId && String(userId).trim()) {
      user = await User.findById(String(userId).trim());
    } else if (email && String(email).trim()) {
      user = await User.findOne({ email: String(email).toLowerCase().trim() });
    } else {
      return NextResponse.json(
        { error: "Either email or userId is required" },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: getCorsHeaders() }
      );
    }

    user.password = DEFAULT_RESET_PASSWORD;
    await user.save();

    return NextResponse.json(
      {
        message:
          "Password reset successfully. User should sign in with temporary password 123456 and change it afterward.",
        data: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200, headers: getCorsHeaders() }
    );
  } catch (error: any) {
    console.error("Error updating password:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update password" },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
