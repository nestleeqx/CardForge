import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { STATUSES } from "@/lib/labels";
import type { ProductStatus } from "@/lib/types";

const VARIANTS = {
  primary: "bg-ink text-white hover:bg-ink/85 shadow-[0_1px_0_rgba(0,0,0,.08)]",
  secondary: "border border-line bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "border border-line bg-surface text-danger hover:bg-danger-soft",
};

export function buttonClasses(variant: keyof typeof VARIANTS = "secondary", size: "sm" | "md" = "md") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${
    size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3.5 text-sm"
  } ${VARIANTS[variant]}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} className={`${buttonClasses(variant, size)} ${className}`}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: ProductStatus }) {
  const s = STATUSES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${s.text}`}>
      {status === "running" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className={`size-1.5 rounded-full ${s.dot}`} />
      )}
      {s.label}
    </span>
  );
}

export function ProgressBar({ counts, total }: { counts: Record<ProductStatus, number>; total: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className="bg-lime-strong transition-all duration-500" style={{ width: pct(counts.done) }} />
      <div className="bg-danger transition-all duration-500" style={{ width: pct(counts.error) }} />
      <div className="animate-pulse bg-info transition-all duration-500" style={{ width: pct(counts.running) }} />
    </div>
  );
}

export function CharCounter({ value, min, max }: { value: number; min?: number; max: number }) {
  const bad = value > max || (min !== undefined && value < min);
  return (
    <span className={`text-[11px] tabular-nums ${bad ? "font-semibold text-danger" : "text-ink-3"}`}>
      {value}
      <span className="opacity-70">{min !== undefined ? ` / ${min}–${max}` : ` / ${max}`}</span>
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    accent: "bg-accent-soft text-accent-ink",
    warn: "bg-warn-soft text-warn",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
