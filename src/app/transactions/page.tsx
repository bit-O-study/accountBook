import Link from "next/link";
import { TransactionOverlay } from "@/components/TransactionOverlay";
import { query } from "@/lib/server/gateway";
import { AddTransaction } from "@/components/AddTransaction";
import { Icon } from "@/components/Icon";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { TxList } from "@/components/TxList";
import { categoryMaps, getUser } from "@/lib/server/data";
import { isValidMonthKey, todayStr } from "@/lib/dates";
import { won } from "@/lib/money";
import { loadTransactions, type TxView } from "@/lib/queries";
import { countsAsIncome, countsAsSpending } from "@/lib/sync/categorize";

const FILTERS = [
  { key: "", label: "전체" },
  { key: "auto", label: "자동" },
  { key: "fixed", label: "고정" },
  { key: "manual", label: "수동" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function applyFilter(txs: TxView[], filter: FilterKey, q: string): TxView[] {
  const needle = q.toLowerCase();
  return txs.filter((t) => {
    if (filter === "auto" && !(t.source === "AUTO" && !t.fixedName)) return false;
    if (filter === "fixed" && !t.fixedName) return false;
    if (filter === "manual" && t.source === "AUTO") return false;
    if (!needle) return true;
    return [t.merchant, t.merchantNorm, t.memo ?? "", t.category, t.accountName ?? ""].some((s) => s.toLowerCase().includes(needle));
  });
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string; q?: string; tx?: string }>;
}) {
  const sp = await searchParams;
  const today = todayStr();
  const current = today.slice(0, 7);
  const month = isValidMonthKey(sp.month) && sp.month <= current ? sp.month : current;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "") as FilterKey;
  const q = (sp.q ?? "").trim().slice(0, 50);

  const user = await getUser();
  const [all, cats] = await Promise.all([loadTransactions(user.id, month), categoryMaps()]);
  const detail = typeof sp.tx === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(sp.tx) ? await query("loadTransaction", { id: sp.tx }) : null;
  const categories = cats.list.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
  const txs = applyFilter(all, filter, q);

  const spent = txs.filter(countsAsSpending).reduce((s, t) => s - t.amount, 0);
  const income = txs.filter(countsAsIncome).reduce((s, t) => s + t.amount, 0);
  const left = all.filter((t) => t.excluded || t.kind === "CARD_BILL" || t.kind === "TRANSFER" || t.status === "CANCELED").length;

  const href = (f: FilterKey) => {
    const p = new URLSearchParams();
    if (month !== current) p.set("month", month);
    if (f) p.set("filter", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/transactions?${s}` : "/transactions";
  };

  return (
    <div className="page">
      {sp.tx !== undefined && <TransactionOverlay transaction={detail} categories={categories} />}
      <div className="page-head">
        <h1 className="hide-sm">거래내역</h1>
        <MonthSwitcher month={month} current={current} basePath="/transactions" params={{ filter: filter || undefined, q: q || undefined }} />
        <Link href="/refunds" className="btn sm">환불 연결</Link>
        <Link href="/installments" className="btn sm">할부 예상 청구</Link>
        <span className="grow" />
        <AddTransaction categories={categories} today={today} />
      </div>

      <div className="toolbar">
        <form method="get" action="/transactions" className="search" role="search">
          {month !== current && <input type="hidden" name="month" value={month} />}
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="tx-q" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            거래 검색
          </label>
          <input id="tx-q" name="q" className="field" placeholder="가맹점, 메모, 카테고리 검색" defaultValue={q} />
        </form>
        <nav className="seg" aria-label="출처 필터">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} className={filter === f.key ? "on" : ""} aria-current={filter === f.key ? "page" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="tx-sum">
        <span>
          지출 <b className="minus">{won(spent)}</b>
        </span>
        <span>
          수입 <b className="plus">{won(income)}</b>
        </span>
        <span>{txs.length}건</span>
        {left > 0 && <span className="faint">카드대금·이체·취소·통계 제외 {left}건은 합계에 안 셈</span>}
      </div>

      <section className="card pad">
        {txs.length === 0 && (q || filter) ? (
          <div className="empty">
            <Icon name="list" />
            <b>{q ? `‘${q}’에 맞는 거래가 없어요` : "이 조건에 맞는 거래가 없어요"}</b>
            <Link href={month !== current ? `/transactions?month=${month}` : "/transactions"} className="btn sm">
              조건 지우기
            </Link>
          </div>
        ) : (
          <TxList txs={txs} categories={categories} />
        )}
      </section>
    </div>
  );
}
