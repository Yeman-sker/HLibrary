import { NextResponse } from "next/server";
import { importHtmlAtPath } from "@/app/lib/store";

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files");
  const paths = form.getAll("paths").map(String);
  const imported = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const relativePath = paths[index];
    if (!(file instanceof File) || !relativePath.toLowerCase().endsWith(".html")) continue;
    const html = Buffer.from(await file.arrayBuffer()).toString("utf8");
    imported.push(await importHtmlAtPath(relativePath, html));
  }

  return NextResponse.json({ imported, count: imported.length });
}
