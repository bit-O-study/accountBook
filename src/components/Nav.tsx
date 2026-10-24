"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

interface NavInfo {
  unread: number;
  suggestions: number;
  accounts: { id: string; name: string; status: string; lastSyncedAt: string | null }[];
}

const MAIN: { href: string; label: string; icon: IconName; short: string }[] = [
  { href: "/", label: "대시보드", icon: "home", short: "홈" },
  { href: "/transactions", label: "거래내역", icon: "list", short: "내역" },
  { href: "/fixed", label: "고정지출", icon: "repeat", short: "고정지출" },
  { href: "/budget", label: "예산", icon: "wallet", short: "예산" },
];
const MANAGE: { href: string; label: string; icon: IconName }[] = [
  { href: "/accounts", label: "연동 계정", icon: "link" },
  { href: "/notifications", label: "알림", icon: "bell" },
];

function isOn(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

function ago(iso: string | null): string {
  if (!iso) return "대기";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}

export function Sidebar({ info }: { info: NavInfo }) {
  const path = usePathname();
  const broken = info.accounts.filter((a) => a.status === "REAUTH" || a.status === "ERROR").length;
  return (
    <aside className="side">
      <Link href="/" className="logo">
        <i>₩</i>가계부
      </Link>
      <nav className="nav" aria-label="메뉴">
        {MAIN.map((m) => (
          <Link key={m.href} href={m.href} className={isOn(path, m.href) ? "on" : ""}>
            <Icon name={m.icon} />
            {m.label}
            {m.href === "/fixed" && info.suggestions > 0 && <span className="badge">제안 {info.suggestions}</span>}
          </Link>
        ))}
        <span className="nav-label">관리</span>
        {MANAGE.map((m) => (
          <Link key={m.href} href={m.href} className={isOn(path, m.href) ? "on" : ""}>
            <Icon name={m.icon} />
            {m.label}
            {m.href === "/accounts" && broken > 0 && <span className="badge bad">{broken}</span>}
            {m.href === "/notifications" && info.unread > 0 && <span className="badge bad">{info.unread}</span>}
          </Link>
        ))}
      </nav>
      {info.accounts.length > 0 && (
        <div className="side-accounts">
          <span className="nav-label" style={{ padding: "0 10px" }}>연결된 계정</span>
          {info.accounts.map((a) => (
            <Link key={a.id} href="/accounts">
              <span className={`dot ${a.status}`} />
              {a.name}
              {/* 상대 시간은 서버·브라우저 렌더 사이에 분이 바뀔 수 있다 */}
              <small className={a.status === "REAUTH" || a.status === "ERROR" ? "err" : ""} suppressHydrationWarning>
                {a.status === "REAUTH" ? "재인증" : a.status === "ERROR" ? "오류" : ago(a.lastSyncedAt)}
              </small>
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}

export function TabBar({ info }: { info: NavInfo }) {
  const path = usePathname();
  const items = [...MAIN, { href: "/accounts", label: "연동", icon: "link" as IconName, short: "연동" }];
  const broken = info.accounts.some((a) => a.status === "REAUTH" || a.status === "ERROR");
  return (
    <nav className="tabbar" aria-label="메뉴">
      {items.map((m) => (
        <Link key={m.href} href={m.href} className={isOn(path, m.href) ? "on" : ""}>
          <Icon name={m.icon} />
          {m.short}
          {((m.href === "/fixed" && info.suggestions > 0) || (m.href === "/accounts" && broken)) && (
            <span className="dot-badge" aria-label="확인할 항목 있음" />
          )}
        </Link>
      ))}
    </nav>
  );
}
