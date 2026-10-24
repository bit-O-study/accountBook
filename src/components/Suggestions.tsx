import { acceptSuggestionAction, dismissSuggestionAction } from "@/app/actions";
import { won } from "@/lib/money";
import { cycleLabel } from "@/lib/recurring/schedule";
import type { Suggestion } from "@/lib/recurring/detect";
import { ActionButton } from "./buttons";

export function Suggestions({ items }: { items: Suggestion[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((s) => (
        <div key={s.merchantNorm} className="suggest">
          <div className="txt">
            <b>새 고정지출을 찾았어요</b>
            <span>
              {s.name} {won(s.amount)}원이 {s.count}번 연속 {cycleLabel(s)}에 결제됐어요.
            </span>
          </div>
          <div className="btns">
            <ActionButton action={acceptSuggestionAction.bind(null, s.merchantNorm)} className="btn pri sm" pending="등록 중…">
              고정지출로 등록
            </ActionButton>
            <ActionButton action={dismissSuggestionAction.bind(null, s.merchantNorm)} className="btn sm" title="90일 동안 다시 제안하지 않아요">
              무시
            </ActionButton>
          </div>
        </div>
      ))}
    </>
  );
}
