import { NextRequest } from "next/server";
import { sendGeneralNotification } from "@/controller/notification";

export async function POST(req: NextRequest) {
    return sendGeneralNotification(req);
}
