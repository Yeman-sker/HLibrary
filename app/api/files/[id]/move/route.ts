import { NextResponse } from "next/server";
import { moveFile } from "@/app/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, { directory }] = await Promise.all([context.params, request.json()]);
  return NextResponse.json(await moveFile(id, directory || "."));
}
