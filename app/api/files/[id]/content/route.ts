import { NextResponse } from "next/server";
import { getHtmlContent, updateHtmlContent, updateMeta } from "@/app/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [html] = await Promise.all([getHtmlContent(id), updateMeta(id, { lastOpenedAt: new Date().toISOString() })]);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "SAMEORIGIN"
    }
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, body] = await Promise.all([context.params, request.json()]);
  if (!body || typeof body.html !== "string") {
    return NextResponse.json({ error: "html is required" }, { status: 400 });
  }
  return NextResponse.json({ file: await updateHtmlContent(id, body.html) });
}
