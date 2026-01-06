import { NextRequest } from "next/server";
import { updatePlayerStats, getMatchStats } from "@/controller/stats";

export async function POST(req: NextRequest) {
    return updatePlayerStats(req);
}

export async function GET(req: NextRequest) {
    return getMatchStats(req);
}
