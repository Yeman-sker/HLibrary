import { NextResponse } from "next/server";
import { importHtmlAtPath } from "@/app/lib/store";

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files");
  const paths = form.getAll("paths").map(String);
  const imported = await Promise.all(
    files.flatMap((file, index) => {
      const relativePath = paths[index];
      if (!(file instanceof File) || !relativePath.toLowerCase().endsWith(".html")) return [];
      return [
        file
          .arrayBuffer()
          .then((buffer) => Buffer.from(buffer).toString("utf8"))
          .then((html) => importHtmlAtPath(relativePath, html))
      ];
    })
  );

  return NextResponse.json({ imported, count: imported.length });
}
