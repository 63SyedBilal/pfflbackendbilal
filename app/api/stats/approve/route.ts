import { NextRequest } from "next/server";
import { approveStats } from "@/controller/stats";

export async function POST(req: NextRequest) {
    return approveStats(req);
}
