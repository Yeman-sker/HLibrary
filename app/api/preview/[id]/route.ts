import { getHtmlContent, updateMeta } from "@/app/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [html] = await Promise.all([getHtmlContent(id), updateMeta(id, { lastOpenedAt: new Date().toISOString() })]);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; frame-ancestors 'self'"
    }
  });
}
