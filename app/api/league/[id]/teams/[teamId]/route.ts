import { NextRequest } from "next/server";
import { removeTeamFromLeague } from "@/controller/league";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; teamId: string }> }
) {
  const params = await props.params;
  return removeTeamFromLeague(req, { params });
}

