import { NextRequest, NextResponse } from "next/server";
import { updatePlayerStats, getMatchStats } from "@/controller/stats";

// CORS headers – required for browser/frontend calls; avoids 404 on OPTIONS preflight
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function GET(req: NextRequest) {
  const response = await getMatchStats(req);
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function POST(req: NextRequest) {
  const response = await updatePlayerStats(req);
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new NextResponse(response.body, { status: response.status, headers });
}
