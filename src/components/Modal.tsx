"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-in">
          <div className="modal-h">
            <h2>{title}</h2>
            <button type="button" className="btn ghost sm" onClick={onClose} aria-label="닫기">
              <Icon name="x" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
