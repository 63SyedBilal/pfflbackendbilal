import { NextRequest } from "next/server";
import { updateSuperAdmin, deleteSuperAdmin } from "@/controller/superadmin";

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return updateSuperAdmin(req, { params });
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return deleteSuperAdmin(req, { params });
}

