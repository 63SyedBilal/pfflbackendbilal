import { NextRequest } from "next/server";
import { removeRefereeFromLeague } from "@/controller/league";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; refereeId: string }> }
) {
  const params = await props.params;
  return removeRefereeFromLeague(req, { params });
}
