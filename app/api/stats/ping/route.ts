/**
 * GET /api/stats/ping - Diagnostic route to verify /api/stats/* is reachable on deployment.
 * Returns 200 with no auth. If this works on staging but GET/POST /api/stats 404, the issue is in the main handler.
 */
import { NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Stats API is reachable", path: "/api/stats" },
    { status: 200, headers: CORS }
  );
}
