import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy, Info, LoaderCircle, X } from "lucide-react";
import { getAddress } from "viem";
import { explorer } from "./chain";
export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className={small ? "brand-mark small" : "brand-mark"}
    >
      <path
        d="M17 2h6v36h-6zM2.9 13.6l3-5.2 31.2 18-3 5.2zM5.9 31.6l-3-5.2 31.2-18 3 5.2z"
        fill="currentColor"
      />
    </svg>
  );
}
export function Field({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {(error || hint) && (
        <p
          id={`${id}-hint`}
          className={error ? "field-error" : "field-hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      <Info size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Busy({ text = "Loading…" }: { text?: string }) {
  return (
    <span className="busy" role="status">
      <LoaderCircle size={18} aria-hidden="true" />
      {text}
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d?.close();
  }, [open]);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) || [],
        ).filter((node) => node.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={!dismissible}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function AddressValue({
  address,
  link = true,
}: {
  address: string;
  link?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const value = getAddress(address);
  return (
    <div className="address-value">
      <span className="address" dir="ltr">
        {link ? (
          <a href={explorer(value)} target="_blank" rel="noreferrer">
            {value}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : (
          value
        )}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={copied ? "Address copied" : "Copy address"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      {error && <small role="status">Select the address to copy it.</small>}
    </div>
  );
}
export function Stat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
