import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { STATUSES } from "@/lib/labels";
import type { ProductStatus } from "@/lib/types";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANTS = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
};

export function buttonClasses(variant: keyof typeof VARIANTS = "secondary", size: "sm" | "md" = "md") {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
  } ${VARIANTS[variant]}`;
}

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
    <button
      {...props}
      disabled={disabled || loading}
      className={`${buttonClasses(variant, size)} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: ProductStatus }) {
  const s = STATUSES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}
    >
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {s.label}
    </span>
  );
}

export function ProgressBar({
  counts,
  total,
}: {
  counts: Record<ProductStatus, number>;
  total: number;
}) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="bg-emerald-500 transition-all duration-500" style={{ width: pct(counts.done) }} />
      <div className="bg-rose-500 transition-all duration-500" style={{ width: pct(counts.error) }} />
      <div
        className="animate-pulse bg-blue-400 transition-all duration-500"
        style={{ width: pct(counts.running) }}
      />
    </div>
  );
}

export function CharCounter({ value, min, max }: { value: number; min?: number; max: number }) {
  const over = value > max;
  const under = min !== undefined && value < min;
  return (
    <span
      className={`text-xs tabular-nums ${over || under ? "font-semibold text-rose-600" : "text-slate-400"}`}
    >
      {value}
      {min !== undefined ? ` / ${min}–${max}` : ` / ${max}`}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}
