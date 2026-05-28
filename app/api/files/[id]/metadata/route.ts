import { NextResponse } from "next/server";
import { updateMeta } from "@/app/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const patch = await request.json();
  return NextResponse.json({ meta: await updateMeta(id, patch) });
}
