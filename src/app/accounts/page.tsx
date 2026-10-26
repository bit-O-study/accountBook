import { reconnectAccountAction, syncAccountAction } from "@/app/actions";
import { ActionButton } from "@/components/buttons";
import { ConnectAccount, DisconnectAccount } from "@/components/ConnectAccount";
import { CsvImport } from "@/components/CsvImport";
import { Icon } from "@/components/Icon";
import { getUser, loadAccounts, loadAccountCounts } from "@/lib/server/data";
import { todayStr } from "@/lib/dates";
import { SyncTime } from "@/components/SyncTime";
import { DEMO_INSTITUTIONS } from "@/lib/sync/providers";

const STATUS_LABEL: Record<string, string> = { OK: "정상", SYNCING: "동기화 중", REAUTH: "재인증 필요", ERROR: "오류" };

export default async function AccountsPage() {
  const user = await getUser();
  const [accounts, { counts, csvCount }] = await Promise.all([
    loadAccounts(user.id),
    loadAccountCounts(user.id, todayStr().slice(0, 7)),
  ]);
  const countOf = new Map(counts.map((c) => [c.accountId, c._count]));
  const connected = new Set(accounts.map((a) => a.name));
  const options = DEMO_INSTITUTIONS.filter((i) => !connected.has(i.name));

  return (
    <div className="page">
      <div className="page-head">
        <h1>연동 계정</h1>
      </div>

      <div className="banner warn" role="note">
        <Icon name="alert" />
        <span className="grow">
          지금은 <b>데모 연동</b>이에요. 실제 카드사·은행에 연결하지 않고 예시 거래를 만들어 자동 기록 흐름을 보여줘요.
        </span>
      </div>

      <div className="acc-grid">
        {accounts.map((a) => {
          const broken = a.syncStatus === "REAUTH" || a.syncStatus === "ERROR";
          return (
            <section key={a.id} className={`card acc ${a.syncStatus}`}>
              <div className="h">
                <span className="ico" aria-hidden="true">
                  {a.name.slice(0, 1)}
                </span>
                <span className="nm">
                  <b>{a.name}</b>
                  <small>
                    {a.kind === "CARD" ? "카드" : "계좌"} · <SyncTime at={a.lastSyncedAt?.toISOString() ?? null} suffix=" 동기화" empty="아직 가져온 적 없음" />
                  </small>
                </span>
                <span className={`pill ${a.syncStatus}`}>{STATUS_LABEL[a.syncStatus] ?? a.syncStatus}</span>
              </div>
              {broken ? (
                <p className="err">
                  {a.lastError ?? "내역을 가져오지 못했어요."} 다시 연결하면 빠진 기간을 한 번에 채워요.
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>
                  이번 달 거래 {countOf.get(a.id) ?? 0}건 · 30분마다 자동 동기화
                </p>
              )}
              <div className="acts">
                {broken ? (
                  <ActionButton action={reconnectAccountAction.bind(null, a.id)} className="btn pri sm" pending="연결 중…">
                    다시 연결
                  </ActionButton>
                ) : (
                  <ActionButton action={syncAccountAction.bind(null, a.id)} className="btn sm" pending="동기화 중…">
                    <Icon name="refresh" />
                    지금 동기화
                  </ActionButton>
                )}
                <DisconnectAccount id={a.id} name={a.name} />
              </div>
            </section>
          );
        })}

        <section className="acc-add">
          <b>카드·계좌 연결</b>
          <ConnectAccount options={options.map((o) => ({ name: o.name, kind: o.kind }))} />
        </section>
      </div>

      <section className="card pad">
        <div className="card-h">
          <h2>CSV 가져오기</h2>
          <span>{csvCount > 0 ? `지금까지 ${csvCount}건 가져옴` : "카드사 명세서 파일"}</span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          연동이 안 되는 카드는 카드사 홈페이지에서 받은 명세서 파일로 넣을 수 있어요. 이미 자동으로 기록된 거래는 건너뛰어요.
        </p>
        <CsvImport />
      </section>
    </div>
  );
}
