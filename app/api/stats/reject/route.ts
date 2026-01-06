import { NextRequest } from "next/server";
import { sendBackStats } from "@/controller/stats";

export async function POST(req: NextRequest) {
    return sendBackStats(req);
}
