import { NextResponse } from "next/server";
import { updateMeta } from "@/app/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, patch] = await Promise.all([context.params, request.json()]);
  return NextResponse.json({ meta: await updateMeta(id, patch) });
}
