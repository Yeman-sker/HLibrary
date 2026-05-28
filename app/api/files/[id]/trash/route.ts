import { NextResponse } from "next/server";
import { trashFile } from "@/app/lib/store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json(await trashFile(id));
}
