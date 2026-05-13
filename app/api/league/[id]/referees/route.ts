import { NextRequest } from "next/server";
import { addRefereeToLeague } from "@/controller/league";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return addRefereeToLeague(req, { params });
}
