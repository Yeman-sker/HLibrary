import { NextResponse } from "next/server";
import { renameProject } from "@/app/lib/store";

export async function POST(request: Request) {
  const { oldName, nextName } = await request.json();
  if (!oldName || !nextName) {
    return NextResponse.json({ error: "oldName and nextName are required" }, { status: 400 });
  }
  return NextResponse.json(await renameProject(oldName, nextName));
}
