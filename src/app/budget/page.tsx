import Link from "next/link";
import { BudgetForm } from "@/components/BudgetForm";
import { CumulativeChart } from "@/components/CumulativeChart";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { getUser, prisma } from "@/lib/db";
import { isValidMonthKey, monthLabel, shiftMonth, todayStr } from "@/lib/dates";
import { won } from "@/lib/money";
import { loadMonthSummary } from "@/lib/queries";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const today = todayStr();
  const current = today.slice(0, 7);
  const month = isValidMonthKey(sp.month) && sp.month <= current ? sp.month : current;
  const isCurrent = month === current;

  const user = await getUser();
  const months = [3, 2, 1].map((n) => shiftMonth(month, -n));
  const [{ summary: s }, own, ...past] = await Promise.all([
    loadMonthSummary(user.id, month, today),
    prisma.budget.findUnique({ where: { userId_month: { userId: user.id, month } } }),
    ...months.map((m) => loadMonthSummary(user.id, m, today)),
  ]);
  const history = [...past.map((p) => p.summary), s];
  const histMax = Math.max(1, ...history.map((h) => Math.max(h.livingSpent, h.budget ?? 0)));

  const over = s.budgetLeft != null && s.budgetLeft < 0;
  const rate = s.budgetUsedRate ?? 0;
  const inherited = s.budget != null && !own;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="hide-sm">예산</h1>
        <MonthSwitcher month={month} current={current} basePath="/budget" />
      </div>

      <div className="grid-eq">
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card-h" style={{ marginBottom: 0 }}>
            <h2>{monthLabel(month)} 생활비</h2>
            {inherited && <span>지난 예산을 이어서 쓰는 중</span>}
          </div>
          {s.budget == null ? (
            <p className="muted">아직 예산이 없어요. 한 달 생활비를 정하면 하루에 쓸 수 있는 금액을 알려드려요.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b className={`mono ${over ? "minus" : ""}`} style={{ fontSize: 30, letterSpacing: "-0.02em" }}>
                  {won(Math.abs(s.budgetLeft ?? 0))}원
                </b>
                <span className="muted">{over ? "초과" : "남음"}</span>
              </div>
              <div className={`bar ${over ? "over" : ""}`} style={{ height: 10 }}>
                <i style={{ width: `${Math.min(100, rate * 100)}%` }} />
              </div>
              <dl className="kv" style={{ gridTemplateColumns: "110px 1fr" }}>
                <dt>예산</dt>
                <dd className="mono">{won(s.budget)}원</dd>
                <dt>생활비 사용</dt>
                <dd className="mono">
                  {won(s.livingSpent)}원 ({Math.round(rate * 100)}%)
                </dd>
                {isCurrent && (
                  <>
                    <dt>하루 가능 금액</dt>
                    <dd className="mono">
                      {won(s.dailyAllowance ?? 0)}원 <span className="muted">· {s.daysLeft}일 남음</span>
                    </dd>
                    <dt>예산 속도</dt>
                    <dd>
                      <span className="mono">{won(s.pace ?? 0)}원</span>{" "}
                      <span className={(s.paceDiff ?? 0) > 0 ? "warn-text" : "good-text"}>
                        ({won(Math.abs(s.paceDiff ?? 0))}원 {(s.paceDiff ?? 0) > 0 ? "많이" : "적게"} 씀)
                      </span>
                    </dd>
                  </>
                )}
                <dt>고정지출 (별도)</dt>
                <dd className="mono">
                  {won(s.fixedSpent)}원 납부
                  {s.fixedRemaining > 0 && <span className="muted"> · {won(s.fixedRemaining)}원 남음</span>}
                </dd>
              </dl>
            </>
          )}
          <BudgetForm key={month} month={month} current={own?.livingAmount ?? s.budget} label={monthLabel(month)} />
        </section>

        <section className="card pad">
          <div className="card-h">
            <h2>카테고리별 생활비</h2>
            <span>{won(s.livingSpent)}원</span>
          </div>
          {s.categories.length === 0 ? (
            <p className="muted">이 달에는 생활비 지출이 없어요.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th className="r">금액</th>
                    <th className="r">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {s.categories.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <Link href={`/transactions?${new URLSearchParams({ ...(isCurrent ? {} : { month }), q: c.name })}`}>{c.name}</Link>
                      </td>
                      <td className="r mono">{won(c.amount)}</td>
                      <td className="r mono muted">{Math.round((c.amount / Math.max(1, s.livingSpent)) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card pad">
        <div className="card-h">
          <h2>생활비 누적 vs 예산 속도</h2>
        </div>
        <CumulativeChart cumulative={s.cumulative} days={s.days} budget={s.budget} monthNo={Number(month.slice(5))} />
      </section>

      <section className="card pad">
        <div className="card-h">
          <h2>최근 4개월</h2>
          <span>생활비 / 예산</span>
        </div>
        <div className="cats">
          {history.map((h) => {
            const hOver = h.budget != null && h.livingSpent > h.budget;
            return (
              <div key={h.month} className="catr" style={{ gridTemplateColumns: "44px minmax(0,1fr) auto" }}>
                <Link href={h.month === current ? "/budget" : `/budget?month=${h.month}`} style={{ fontWeight: h.month === month ? 700 : 400 }}>
                  {Number(h.month.slice(5))}월
                </Link>
                <div className={`bar ${hOver ? "over" : ""}`} style={{ position: "relative" }}>
                  <i style={{ width: `${(h.livingSpent / histMax) * 100}%` }} />
                  {h.budget != null && (
                    <span
                      aria-hidden="true"
                      style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "var(--ink2)", left: `calc(${(h.budget / histMax) * 100}% - 1px)` }}
                    />
                  )}
                </div>
                <span className="v" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3 }}>
                  <span className={hOver ? "minus" : ""}>{won(h.livingSpent)}</span>
                  <span className="faint" style={{ fontSize: 11 }}>
                    예산 {h.budget == null ? "—" : won(h.budget)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          세로선은 그달 예산이에요.{history.some((h) => h.month === current) && " 이번 달은 오늘까지 쓴 금액이에요."}
        </p>
      </section>
    </div>
  );
}
