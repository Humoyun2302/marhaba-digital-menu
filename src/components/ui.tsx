import { ChevronDown, Loader2, MoreHorizontal, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const controlBase =
  "w-full rounded-[16px] border border-line bg-paper px-4 text-base text-ink outline-none transition placeholder:text-muted focus:border-burgundy/40 disabled:cursor-not-allowed disabled:opacity-60";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-burgundy text-ivory hover:bg-wine",
  secondary: "border border-line bg-paper text-ink hover:bg-ivory",
  ghost: "text-ink hover:bg-burgundy/6",
  danger: "text-burgundy hover:bg-burgundy/8",
};

const buttonSizes: Record<ButtonSize, string> = {
  md: "h-12 gap-2 rounded-[16px] px-4 text-sm",
  sm: "h-11 gap-1.5 rounded-[14px] px-3.5 text-sm",
  icon: "h-11 w-11 rounded-[14px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") {
  return cx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={16} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, "h-12", className)} {...props} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, "min-h-24 py-3", className)} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(controlBase, "h-12 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  clearLabel,
  onClear,
  pill = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  clearLabel?: string;
  onClear?: () => void;
  pill?: boolean;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        className={cx(controlBase, "h-12 pl-11", pill && "rounded-full shadow-[var(--shadow-soft)]", value && onClear && "pr-12")}
      />
      {value && onClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="absolute top-1/2 right-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-burgundy hover:bg-burgundy/8"
        >
          <X size={16} />
        </button>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[16px] border border-line bg-paper px-4 py-3 text-left"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full", checked ? "bg-burgundy" : "bg-[#e6dccf]")}>
        <span
          className={cx(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-paper shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-[24px] border border-line bg-paper shadow-[var(--shadow-soft)]", className)}>
      {children}
    </section>
  );
}

export function EntityCard({
  children,
  dragging = false,
  className = "",
}: {
  children: ReactNode;
  dragging?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-[22px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)]",
        dragging && "z-10 ring-2 ring-burgundy/25",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-line/80 bg-ivory p-4 sm:p-5">
      <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        active ? "bg-burgundy/10 text-burgundy" : "bg-[#efe8dc] text-muted",
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-burgundy" : "bg-muted/60")} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
        <h1 className={cx("font-serif text-4xl leading-none text-ink", eyebrow && "mt-1")}>{title}</h1>
        {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-burgundy/15 bg-paper px-6 py-12 text-center shadow-[var(--shadow-soft)]">
      {icon ? (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-burgundy/10 text-burgundy">{icon}</div>
      ) : null}
      <p className="font-serif text-3xl text-ink">{title}</p>
      {text ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{text}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:flex sm:justify-end">{children}</div>;
}

type MenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="secondary"
        size="icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} />
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-2 min-w-44 rounded-[18px] border border-line bg-paper p-1.5 shadow-[var(--shadow-soft)]"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx(
                "flex h-11 w-full items-center rounded-[12px] px-3 text-left text-sm disabled:opacity-40",
                item.tone === "danger" ? "text-burgundy hover:bg-burgundy/8" : "text-ink hover:bg-ivory",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[22px] bg-paper", className)} />;
}
