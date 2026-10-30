import Link from "next/link";
import { getUser } from "@/lib/server/data";
import { query } from "@/lib/server/gateway";
import { isValidMonthKey, todayStr } from "@/lib/dates";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { RefundCard } from "@/components/RefundCard";

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await getUser();
  const params = await searchParams;
  const current = todayStr().slice(0, 7);
  const month = isValidMonthKey(params.month) && params.month <= current ? params.month : current;
  const refunds = await query("loadRefunds", { month });
  return <div className="page">
    <div className="page-head"><h1>환불 연결</h1><Link href="/transactions" className="btn sm">거래내역</Link></div>
    <MonthSwitcher month={month} current={current} basePath="/refunds" />
    <section className="card pad" style={{ marginTop: 16 }}>
      <p>입금된 환불을 원래 지출과 연결해 두세요. 지출·수입·예산 합계는 그대로예요.</p>
      <p className="faint">같은 가맹점의 이전 180일 지출 중 남은 원금으로 연결 가능한 후보를 최대 5개 보여 줘요. 일반 입금일 수도 있으니 실제 환불 내역을 확인한 뒤 선택하세요.</p>
      <p className="faint">원거래 취소·금액 변경 후에는 현재 거래를 다시 확인하세요. 연결은 납부·취소 상태를 변경하지 않아요.</p>
    </section>
    {refunds.length ? refunds.map(refund => <RefundCard key={refund.id} refund={refund} />) :
      <section className="card pad" style={{ marginTop: 16 }}><div className="empty"><b>이 달에 연결할 입금이 없어요</b><span>환불 입금을 수입으로 기록한 뒤 확인해 보세요.</span></div></section>}
  </div>;
}
