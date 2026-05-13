import { NextRequest } from "next/server";
import { removeStatKeeperFromLeague } from "@/controller/league";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; statKeeperId: string }> }
) {
  const params = await props.params;
  return removeStatKeeperFromLeague(req, { params });
}
