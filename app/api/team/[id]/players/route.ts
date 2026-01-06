import { NextRequest } from "next/server";
import { addPlayer } from "@/controller/team";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return addPlayer(req, { params });
}








