import { won } from "@/lib/money";

/** 생활비 누적 vs 예산 속도. 하나의 눈금으로 선·축·라벨을 모두 그린다. */
export function CumulativeChart({
  cumulative,
  days,
  budget,
  monthNo,
}: {
  cumulative: number[];
  days: number;
  budget: number | null;
  monthNo: number;
}) {
  const W = 600;
  const H = 220;
  const L = 52;
  const R = 18;
  const T = 16;
  const B = 26;
  const peak = Math.max(budget ?? 0, ...cumulative, 1);
  const step = Math.ceil(peak / 3 / 100000) * 100000;
  const max = step * 3;
  const x = (d: number) => L + ((d - 1) / (days - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, step, step * 2, step * 3];
  const xs = [1, 8, 15, 22, days];

  const pts = cumulative.map((v, i) => [x(i + 1), y(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const lastValue = cumulative[cumulative.length - 1] ?? 0;
  const labelLeft = last ? last[0] > W * 0.45 : false;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`생활비 누적 ${won(lastValue)}원${budget ? `, 예산 ${won(budget)}원` : ""}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="tick" x={L - 8} y={y(v) + 3.5} textAnchor="end">
              {v === 0 ? "0" : `${v / 10000}만`}
            </text>
          </g>
        ))}
        {xs.map((d) => (
          <text key={d} className="tick" x={x(d)} y={H - 6} textAnchor="middle">
            {monthNo}.{d}
          </text>
        ))}
        {budget != null && (
          <>
            <path className="pace" d={`M${x(1)} ${y(budget / days)} L${x(days)} ${y(budget)}`} />
            <text className="pacelbl" x={x(days) - 4} y={y(budget) + 14} textAnchor="end">
              예산 {budget / 10000}만
            </text>
          </>
        )}
        {pts.length > 1 && (
          <>
            <path className="area" d={`${line} L${last[0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`} />
            <path className="line" d={line} />
          </>
        )}
        {last && (
          <>
            <circle className="end" cx={last[0]} cy={last[1]} r={5} />
            <text className="endlbl" x={last[0] + (labelLeft ? -10 : 10)} y={last[1] - 10} textAnchor={labelLeft ? "end" : "start"}>
              {monthNo}.{cumulative.length} · {won(lastValue)}원
            </text>
          </>
        )}
      </svg>
      <div className="legend">
        <span>
          <i />
          생활비 누적 (고정지출 제외)
        </span>
        {budget != null && (
          <span>
            <i className="p" />
            예산 속도 {won(budget)} ÷ {days}일
          </span>
        )}
      </div>
    </div>
  );
}
