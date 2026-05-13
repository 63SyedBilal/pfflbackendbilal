import { NextRequest } from "next/server";
import { addStatKeeperToLeague } from "@/controller/league";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return addStatKeeperToLeague(req, { params });
}
