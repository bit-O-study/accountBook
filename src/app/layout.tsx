import type { Metadata, Viewport } from "next";
import { getUser } from "@/lib/db";
import { loadShellInfo } from "@/lib/queries";
import { getSuggestions } from "@/lib/recurring/service";
import { Sidebar, TabBar } from "@/components/Nav";
import { SyncOnOpen } from "@/components/SyncOnOpen";
import "./globals.css";

export const metadata: Metadata = {
  title: "가계부",
  description: "결제하면 자동으로 기록되고, 고정지출은 미리 알려주는 가계부",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1311" },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const [shell, suggestions] = await Promise.all([loadShellInfo(user.id), getSuggestions(user.id)]);
  const info = { ...shell, suggestions: suggestions.length };

  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <Sidebar info={info} />
          <main className="main">{children}</main>
        </div>
        <TabBar info={info} />
        <SyncOnOpen />
      </body>
    </html>
  );
}
