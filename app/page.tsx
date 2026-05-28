import type { Metadata } from "next";
import HLibraryClient from "./hlibrary-client";
import { getStats, listHtmlFiles } from "./lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HLibrary",
  description: "Import, organize, preview, and edit HTML documents."
};

export default async function Page() {
  const [files, stats] = await Promise.all([listHtmlFiles(), getStats()]);

  return <HLibraryClient initialFiles={files} initialStats={stats} />;
}
