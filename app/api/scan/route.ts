import { NextResponse } from "next/server";
import { listHtmlFiles } from "@/app/lib/store";

export async function POST() {
  return NextResponse.json({ files: await listHtmlFiles(), scannedAt: new Date().toISOString() });
}
