import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saji | Restaurant Workspace",
  description: "Lihat menu dan pesan langsung dari meja Anda",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
