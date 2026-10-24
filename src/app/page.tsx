import Link from "next/link";
import { reconnectAccountAction, syncNowAction } from "@/app/actions";
import { AddTransaction } from "@/components/AddTransaction";
import { ActionButton } from "@/components/buttons";
import { CumulativeChart } from "@/components/CumulativeChart";
import { FixedCalendar } from "@/components/FixedCalendar";
import { Icon } from "@/components/Icon";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Suggestions } from "@/components/Suggestions";
import { TxList } from "@/components/TxList";
import { categoryMaps, getUser, prisma } from "@/lib/db";
import { isValidMonthKey, kstDateStr, relativeDue, shortDate, todayStr } from "@/lib/dates";
import { signedWon, won } from "@/lib/money";
import { loadMonthSummary } from "@/lib/queries";
import { getSuggestions } from "@/lib/recurring/service";
import styles from "./dashboard.module.css";

const STATUS_LABEL: Record<string, string> = { PAID: "납부완료", SCHEDULED: "예정", CHANGED: "금액변동", MISSING: "미확인" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const today = todayStr();
  const current = today.slice(0, 7);
  const month = isValidMonthKey(sp.month) && sp.month <= current ? sp.month : current;
  const isCurrent = month === current;

  const user = await getUser();
  const [{ txs, occurrences, summary: s }, suggestions, accounts, cats, unread] = await Promise.all([
    loadMonthSummary(user.id, month, today),
    getSuggestions(user.id, today),
    prisma.linkedAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    categoryMaps(),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const categories = cats.list.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const broken = accounts.filter((a) => a.syncStatus === "REAUTH" || a.syncStatus === "ERROR");
  const lastSync = accounts
    .filter((a) => a.lastSyncedAt)
    .map((a) => a.lastSyncedAt!.getTime())
    .sort((a, b) => b - a)[0];
  const syncMin = lastSync ? Math.max(0, Math.floor((Date.now() - lastSync) / 60000)) : null;

  const upcoming = occurrences.filter((o) => o.status === "SCHEDULED" || o.status === "MISSING");
  const nextUp = upcoming[0];
  const recent = txs.filter((t) => t.status === "APPROVED").slice(0, 7);
  const catMax = Math.max(1, ...s.categories.map((c) => c.amount));
  const over = s.budgetLeft != null && s.budgetLeft < 0;
  const marks = [
    ...occurrences.map((o) => ({ date: o.dueDate, status: o.status, label: `${o.rule.name} ${won(o.matchedAmount ?? o.rule.amount)}원` })),
    ...(isCurrent
      ? suggestions
          .filter((x) => x.cycle === "MONTHLY")
          .map((x) => ({ date: `${month}-${String(Math.min(x.dueDay, s.days)).padStart(2, "0")}`, status: "SUGGEST", label: `${x.name} (감지)` }))
      : []),
  ];

  return (
    <div className={`page ${styles.dashboard}`}>
      <div className="page-head">
        <MonthSwitcher month={month} current={current} basePath="/" />
        <span className="grow" />
        {accounts.length > 0 && (
          <span className="sync-chip hide-sm">
            <span className={`dot ${broken.length ? "ERROR" : "OK"}`} />
            {syncMin == null ? "동기화 전" : syncMin < 1 ? "방금 동기화" : `${syncMin}분 전 동기화`}
          </span>
        )}
        {accounts.length > 0 && (
          <ActionButton action={syncNowAction} className="btn hide-sm" pending="동기화 중…">
            <Icon name="refresh" />
            지금 동기화
          </ActionButton>
        )}
        <Link href="/notifications" className="btn ghost" aria-label={`알림 보기${unread ? ` ${unread}건 안 읽음` : ""}`}>
          <Icon name="bell" />
          {unread > 0 && <span className="badge bad" style={{ marginLeft: 0 }}>{unread}</span>}
        </Link>
        <AddTransaction categories={categories} today={today} />
      </div>

      {broken.map((a) => (
        <div key={a.id} className="banner" role="alert">
          <Icon name="alert" className="hide-sm" />
          <span className="grow">
            <b>{a.name}</b> 내역을 {a.lastSyncedAt ? `${shortDate(kstDateStr(a.lastSyncedAt))} 이후` : "아직"} 가져오지 못했어요.
          </span>
          {a.syncStatus === "REAUTH" ? (
            <ActionButton action={reconnectAccountAction.bind(null, a.id)} className="btn danger sm" pending="연결 중…">
              다시 연결
            </ActionButton>
          ) : (
            <Link href="/accounts" className="btn danger sm">
              확인
            </Link>
          )}
        </div>
      ))}

      {isCurrent && <Suggestions items={suggestions} />}

      {accounts.length === 0 && txs.length === 0 && (
        <div className="card empty">
          <b>아직 거래가 없어요</b>
          데모 계정을 연결하거나 거래를 직접 입력해 보세요.
          <Link href="/accounts" className="btn pri">
            데모 카드·계좌 연결
          </Link>
        </div>
      )}

      <div className="kpis">
        <div className={`card kpi ${styles.primary}`}>
          <small>{isCurrent ? "이번 달 지출" : "지출"}</small>
          <b className="minus">{won(s.totalSpent)}</b>
          <span className="sub">고정 {won(s.fixedSpent)} 포함</span>
        </div>
        <div className="card kpi">
          <small>{over ? "생활비 예산 초과" : "생활비 예산 남음"}</small>
          {s.budget == null ? (
            <>
              <b className="faint">—</b>
              <Link href="/budget" className="sub">
                예산 정하기
              </Link>
            </>
          ) : (
            <>
              <b className={over ? "minus" : ""}>{won(Math.abs(s.budgetLeft ?? 0))}</b>
              <div className={`bar ${over ? "over" : ""}`}>
                <i style={{ width: `${Math.min(100, (s.budgetUsedRate ?? 0) * 100)}%` }} />
              </div>
              <span className="sub">
                {Math.round((s.budgetUsedRate ?? 0) * 100)}% 사용
                {isCurrent && s.dailyAllowance != null && ` · 하루 ${won(s.dailyAllowance)}원`}
              </span>
            </>
          )}
        </div>
        <div className="card kpi">
          <small>남은 고정지출</small>
          <b>{won(s.fixedRemaining)}</b>
          <span className={`sub ${nextUp ? "warn-text" : ""}`}>
            {nextUp
              ? `${s.fixedRemainingCount}건 · ${nextUp.rule.name} ${nextUp.status === "MISSING" ? "미확인" : relativeDue(nextUp.dueDate, today)}`
              : occurrences.length === 0 ? "이번 달 예정된 고정지출 없음" : "이번 달 모두 납부"}
          </span>
        </div>
        <div className="card kpi">
          <small>{isCurrent ? "월말 예상 잔액" : "월 잔액"}</small>
          <b>{signedWon(s.projectedBalance)}</b>
          <span className="sub">수입 {won(s.income)} 기준</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card pad">
          <div className="card-h">
            <h2>생활비 누적 vs 예산 속도</h2>
            {s.paceDiff != null && isCurrent && (
              <span className={s.paceDiff > 0 ? "warn-text" : "good-text"} style={{ fontWeight: 600 }}>
                예산 속도보다 {won(Math.abs(s.paceDiff))}원 {s.paceDiff > 0 ? "많이" : "적게"} 씀
              </span>
            )}
          </div>
          <CumulativeChart cumulative={s.cumulative} days={s.days} budget={s.budget} monthNo={Number(month.slice(5))} />
        </section>
        <section className="card pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-h">
            <h2>카테고리</h2>
            <span>생활비 {won(s.livingSpent)}</span>
          </div>
          {s.categories.length === 0 ? (
            <p className="muted">아직 생활비 지출이 없어요.</p>
          ) : (
            <div className="cats">
              {s.categories.slice(0, 6).map((c, i) => (
                <div key={c.name} className="catr">
                  <span>{c.name}</span>
                  <div className="bar">
                    <i style={{ width: `${(c.amount / catMax) * 100}%`, opacity: 1 - i * 0.13 }} />
                  </div>
                  <span className="v">{won(c.amount)}</span>
                  <span className="pct">{Math.round((c.amount / Math.max(1, s.livingSpent)) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="fixed-note" style={{ marginTop: "auto", paddingTop: 7 }}>
            <span>+ 고정지출 (별도)</span>
            <b>{won(s.fixedSpent)}</b>
          </div>
        </section>
      </div>

      <div className="grid-2b">
        <section className="card pad">
          <div className="card-h">
            <h2>고정지출 달력</h2>
            <Link href="/fixed">
              월 {won(s.fixedTotal)} · {occurrences.length}건
            </Link>
          </div>
          <FixedCalendar month={month} today={today} marks={marks} />
          {upcoming.length > 0 && (
            <div className="tx-list" style={{ marginTop: 12 }}>
              {upcoming.slice(0, 3).map((o) => (
                <div key={o.id} className="fx" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
                  <span className="body">
                    <b>{o.rule.name}</b>
                    <span>
                      {shortDate(o.dueDate)} · {o.rule.payment ?? "결제수단 미지정"}
                    </span>
                  </span>
                  <span className="mono">{won(o.rule.amount)}</span>
                  <span className={`pill ${o.status}`}>{o.status === "SCHEDULED" ? relativeDue(o.dueDate, today) : STATUS_LABEL[o.status]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card pad">
          <div className="card-h">
            <h2>최근 거래</h2>
            <Link href={isCurrent ? "/transactions" : `/transactions?month=${month}`}>전체 보기</Link>
          </div>
          <TxList txs={recent} categories={categories} grouped={false} />
        </section>
      </div>
    </div>
  );
}
