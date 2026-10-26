import { deleteRecurringAction, togglePauseRecurringAction } from "@/app/actions";
import { ActionButton, ConfirmButton } from "@/components/buttons";
import { Icon } from "@/components/Icon";
import { RecurringFormButton } from "@/components/RecurringForm";
import { Suggestions } from "@/components/Suggestions";
import { categoryMaps, getUser, loadRules } from "@/lib/server/data";
import { monthRange, relativeDue, shortDate, todayStr } from "@/lib/dates";
import { won } from "@/lib/money";
import { getSuggestions } from "@/lib/server/data";
import { cycleLabel, nextDueDate } from "@/lib/recurring/schedule";

const STATUS_LABEL: Record<string, string> = { PAID: "납부완료", SCHEDULED: "예정", CHANGED: "금액변동", MISSING: "미확인" };
const WEEK = "일월화수목금토";

export default async function FixedPage() {
  const today = todayStr();
  const r = monthRange(today.slice(0, 7));
  const user = await getUser();
  const [rules, suggestions, cats] = await Promise.all([
    loadRules(user.id, today.slice(0, 7)),
    getSuggestions(user.id, today),
    categoryMaps(),
  ]);
  const categories = cats.list.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

  const thisMonth = rules.flatMap((rule) =>
    rule.occurrences.filter((o) => o.dueDate >= r.first).map((o) => ({ ...o, amount: o.matchedAmount ?? rule.amount })),
  );
  const total = thisMonth.reduce((s, o) => s + o.amount, 0);
  const paid = thisMonth.filter((o) => o.status === "PAID" || o.status === "CHANGED").reduce((s, o) => s + o.amount, 0);
  const count = (st: string) => thisMonth.filter((o) => o.status === st).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>고정지출</h1>
        <span className="grow" />
        <RecurringFormButton categories={categories} label="고정지출 추가" />
      </div>

      <section className="card pad">
        <div className="progress-head">
          <span>
            이번 달 <b>{won(total)}</b>원
          </span>
          <span>
            {won(paid)}원 납부 · {thisMonth.length}건 중 {count("PAID") + count("CHANGED")}건
          </span>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={Math.round((paid / Math.max(1, total)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="이번 달 납부 진행률">
          <i style={{ width: `${(paid / Math.max(1, total)) * 100}%`, background: "var(--good)" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(["PAID", "SCHEDULED", "CHANGED", "MISSING"] as const).map((st) =>
            count(st) ? (
              <span key={st} className={`pill ${st}`}>
                {STATUS_LABEL[st]} {count(st)}
              </span>
            ) : null,
          )}
        </div>
      </section>

      <Suggestions items={suggestions} />

      <section className="card pad">
        <div className="card-h">
          <h2>등록된 고정지출</h2>
          <span>{rules.length}건 · 결제일 순</span>
        </div>
        {rules.length === 0 ? (
          <div className="empty">
            <Icon name="repeat" />
            <b>아직 고정지출이 없어요</b>
            월세, 통신비, 구독료처럼 매달 나가는 돈을 등록하면 결제 전에 알려드려요.
            <RecurringFormButton categories={categories} label="첫 고정지출 추가" />
          </div>
        ) : (
          <div className="tx-list">
            {rules.map((rule) => {
              const ended = !!rule.endDate && rule.endDate < today;
              const next = rule.paused || ended ? null : nextDueDate(rule, today);
              const cur = rule.occurrences.find((o) => o.dueDate >= r.first);
              const history = [...rule.occurrences].reverse();
              const variable = rule.amountMin != null || rule.amountMax != null;
              return (
                <div key={rule.id} className={`fx ${rule.paused || ended ? "paused" : ""}`}>
                  <span className="d" aria-hidden="true">
                    <b>{rule.cycle === "WEEKLY" ? WEEK[rule.dueDay] : String(rule.dueDay).padStart(2, "0")}</b>
                    {rule.cycle === "WEEKLY" ? "매주" : rule.cycle === "YEARLY" ? `${rule.dueMonth}월` : "매월"}
                  </span>
                  <span className="body">
                    <b>{rule.name}</b>
                    <span>
                      {cycleLabel(rule)}
                      {rule.payment ? ` · ${rule.payment}` : ""}
                      {rule.category ? ` · ${rule.category.name}` : ""}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                      {history.length > 0 && (
                        <span className="history" title="최근 납부 기록">
                          {history.map((o) => (
                            <i key={o.id} className={o.status} title={`${shortDate(o.dueDate)} ${STATUS_LABEL[o.status]}`} />
                          ))}
                        </span>
                      )}
                      {rule.paused
                        ? "일시정지"
                        : ended
                          ? `${shortDate(rule.endDate!)} 종료`
                          : next
                            ? `다음 ${shortDate(next)} (${relativeDue(next, today)})`
                            : ""}
                    </span>
                  </span>
                  <span className="amt">
                    <span className="mono">{won(rule.amount)}</span>
                    {variable && (
                      <span className="faint mono" style={{ fontSize: 11 }}>
                        {won(rule.amountMin ?? 0)}~{rule.amountMax != null ? won(rule.amountMax) : ""}
                      </span>
                    )}
                    {rule.paused ? (
                      <span className="pill PAUSED">일시정지</span>
                    ) : cur ? (
                      <span className={`pill ${cur.status}`}>
                        {cur.status === "SCHEDULED" ? relativeDue(cur.dueDate, today) : STATUS_LABEL[cur.status]}
                      </span>
                    ) : (
                      <span className="pill PAUSED">이번 달 없음</span>
                    )}
                    {cur?.status === "CHANGED" && cur.matchedAmount != null && (
                      <span className="warn-text mono" style={{ fontSize: 11 }}>
                        실제 {won(cur.matchedAmount)}
                      </span>
                    )}
                  </span>
                  <span className="acts">
                    <RecurringFormButton
                      categories={categories}
                      className="btn ghost sm"
                      rule={{
                        id: rule.id,
                        name: rule.name,
                        amount: rule.amount,
                        amountMin: rule.amountMin,
                        amountMax: rule.amountMax,
                        cycle: rule.cycle,
                        dueDay: rule.dueDay,
                        dueMonth: rule.dueMonth,
                        merchantNorm: rule.merchantNorm,
                        categoryId: rule.categoryId,
                        payment: rule.payment,
                        notifyDays: rule.notifyDays,
                        endDate: rule.endDate,
                      }}
                    />
                    <ActionButton
                      action={togglePauseRecurringAction.bind(null, rule.id)}
                      className="btn ghost sm"
                      title={rule.paused ? "다시 시작" : "일시정지"}
                      pending="…"
                    >
                      <Icon name={rule.paused ? "play" : "pause"} />
                    </ActionButton>
                    <ConfirmButton action={deleteRecurringAction.bind(null, rule.id)} className="btn ghost sm" confirmLabel="삭제할까요?" title="삭제">
                      <Icon name="trash" />
                    </ConfirmButton>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <p className="faint" style={{ fontSize: 12.5 }}>
        결제일 ±3일 안에 같은 가맹점 거래가 들어오면 자동으로 납부완료가 돼요. 금액이 10% 넘게 다르면 금액변동, 결제일 3일이 지나도 없으면 미확인으로 알려드려요.
      </p>
    </div>
  );
}
