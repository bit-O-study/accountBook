import { daysInMonth, makeDate, weekday, type DateStr, type MonthKey } from "@/lib/dates";

export function FixedCalendar({
  month,
  today,
  marks,
}: {
  month: MonthKey;
  today: DateStr;
  marks: { date: DateStr; status: string; label: string }[];
}) {
  const [y, m] = month.split("-").map(Number);
  const days = daysInMonth(y, m);
  const lead = weekday(makeDate(y, m, 1));
  const byDay = new Map<number, { status: string; label: string }[]>();
  for (const k of marks) {
    const d = Number(k.date.slice(8));
    byDay.set(d, [...(byDay.get(d) ?? []), k]);
  }

  return (
    <>
      <div className="cal" role="grid" aria-label={`${m}월 고정지출 달력`}>
        {"일월화수목금토".split("").map((w) => (
          <span key={w} className="wd">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} className="c e" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const date = makeDate(y, m, d);
          const list = byDay.get(d) ?? [];
          const cls = ["c", weekday(date) === 0 && "sun", date < today && "past", date === today && "today"].filter(Boolean).join(" ");
          return (
            <span key={d} className={cls} title={list.map((l) => l.label).join(", ") || undefined}>
              {d}
              {list.length > 0 && (
                <span className="marks">
                  {list.map((l, j) => (
                    <i key={j} className={l.status} />
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i style={{ background: "var(--good)" }} />
          납부완료
        </span>
        <span>
          <i style={{ background: "var(--accent)" }} />
          예정
        </span>
        <span>
          <i style={{ background: "var(--bad)" }} />
          미확인
        </span>
        <span>
          <i style={{ border: "1px dashed var(--warn)" }} />
          감지된 반복결제
        </span>
      </div>
    </>
  );
}
