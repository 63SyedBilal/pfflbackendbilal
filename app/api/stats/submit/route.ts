import { NextRequest } from "next/server";
import { submitStats } from "@/controller/stats";

export async function POST(req: NextRequest) {
    return submitStats(req);
}
