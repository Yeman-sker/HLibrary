import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HLibrary",
  description: "Local HTML report management workspace"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
