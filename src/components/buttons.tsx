"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn pri", pending: label }: { children: ReactNode; className?: string; pending?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (label ?? "처리 중…") : children}
    </button>
  );
}

/** 서버 액션을 부르는 버튼. 진행 중에는 비활성화 */
export function ActionButton({
  action,
  children,
  className = "btn",
  pending: label,
  title,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  pending?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} disabled={pending} title={title} onClick={() => start(async () => void (await action()))}>
      {pending ? (label ?? "처리 중…") : children}
    </button>
  );
}

/** 브라우저 confirm() 대신 두 번 누르게 하는 삭제 버튼 */
export function ConfirmButton({
  action,
  children,
  confirmLabel = "한 번 더 누르면 삭제",
  className = "btn danger sm",
  title,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      title={title}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        start(async () => void (await action()));
      }}
    >
      {pending ? "삭제 중…" : armed ? confirmLabel : children}
    </button>
  );
}
