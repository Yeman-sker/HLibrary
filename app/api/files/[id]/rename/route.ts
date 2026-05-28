import { NextResponse } from "next/server";
import { renameFile } from "@/app/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { name } = await request.json();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  return NextResponse.json(await renameFile(id, name));
}
