import { NextRequest, NextResponse } from "next/server";
import { setLeagueWinner } from "@/controller/league";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const response = await setLeagueWinner(req, { params: { id: resolvedParams.id } });
    const headers = new Headers(response.headers);
    Object.entries(getCorsHeaders()).forEach(([key, value]) => headers.set(key, value));
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}
