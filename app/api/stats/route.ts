import { NextResponse } from "next/server";
import { getStats } from "@/app/lib/store";

export async function GET() {
  return NextResponse.json(await getStats());
}
