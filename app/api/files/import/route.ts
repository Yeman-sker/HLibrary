import { NextResponse } from "next/server";
import { importHtml } from "@/app/lib/store";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const directory = String(form.get("directory") || "imports");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const html = Buffer.from(await file.arrayBuffer()).toString("utf8");
  return NextResponse.json(await importHtml(file.name, html, directory));
}
