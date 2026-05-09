import { NextRequest } from "next/server";
import { removePlayer } from "@/controller/team";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> | { id: string; playerId: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  return removePlayer(req, { params: resolvedParams });
}








