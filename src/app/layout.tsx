import type { Metadata, Viewport } from "next";
import { currentUser } from "@/lib/auth/request";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { loadShellInfo } from "@/lib/queries";
import { getSuggestions } from "@/lib/server/data";
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
  const user = await currentUser();
  const data = user ? await Promise.all([loadShellInfo(user.id), getSuggestions(user.id)]) : null;
  const info = data ? { ...data[0], suggestions: data[1].length } : null;

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
        {user && info ? <><div className="shell">
          <Sidebar info={info} />
          <main className="main"><AccountMenu name={user.name} />{children}</main>
        </div>
        <TabBar info={info} />
        <SyncOnOpen /></> : children}
      </body>
    </html>
  );
}
