import Link from "next/link";
import { getUser } from "@/lib/server/data";
import { query } from "@/lib/server/gateway";
import { isValidMonthKey, shiftMonth, todayStr } from "@/lib/dates";
import { won } from "@/lib/money";

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await getUser();
  const params = await searchParams;
  const month = isValidMonthKey(params.month) && params.month >= "0100-01" && params.month <= "9999-12" ? params.month : todayStr().slice(0, 7);
  const rows = await query("loadInstallments", { month });
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return <div className="page">
    <div className="page-head"><h1>할부 예상 청구</h1><Link href="/transactions" className="btn sm">거래내역</Link></div>
    <section className="card pad" style={{ display: "grid", gap: 16 }}>
      <form action="/installments" className="toolbar">
        <label className="label">청구 월<input aria-label="청구 월" className="field" type="month" name="month" min="0100-01" max="9999-12" defaultValue={month} required /></label>
        <button className="btn" type="submit">조회</button>
      </form>
      <nav className="toolbar" aria-label="청구 월 이동">
        {month > "0100-01" && <Link className="btn sm" href={"/installments?month=" + shiftMonth(month, -1)}>이전 달</Link>}
        <b>{month}</b>
        {month < "9999-12" && <Link className="btn sm" href={"/installments?month=" + shiftMonth(month, 1)}>다음 달</Link>}
      </nav>
      <div className="tx-sum"><span>할부 원금 예상 <b className="minus">{won(total)}원</b></span><span>{rows.length}건</span></div>
      <p className="faint">거래 상세에서 지정한 할부의 원금만 합산해요. 일시불·이자·수수료는 포함하지 않으며 실제 카드 명세서와 다를 수 있어요.</p>
      <p className="faint">취소·통계 제외 거래는 빠져요. 부분취소 후에는 현재 원금으로 모든 회차를 다시 계산하므로 지난달 예상액도 바뀔 수 있어요. 대시보드와 예산은 승인 총액 기준이에요.</p>
    </section>
    <section className="card pad" style={{ marginTop: 16 }} aria-label="할부 목록">
      {rows.length === 0 ? <div className="empty"><b>이 달에 청구 예정인 할부가 없어요</b><span>거래내역에서 지출 거래를 열고 할부를 설정해 보세요.</span></div> : rows.map(row =>
        <article key={row.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--line)", overflowWrap: "anywhere" }}>
          <Link href={"/transactions?month=" + row.approvalMonth + "&tx=" + encodeURIComponent(row.id)}>{row.merchant}</Link>
          <p><b>{won(row.amount)}원</b> · {row.installment}/{row.months}회차</p>
          <p className="faint">이 회차 이후 남은 원금 {won(row.remaining)}원</p>
          <p className="faint">{row.accountName} · 원금 {won(row.total)}원 · {row.firstMonth} ~ {row.lastMonth}</p>
        </article>)}
    </section>
  </div>;
}
