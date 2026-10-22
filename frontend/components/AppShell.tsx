"use client";

import { ArrowUpRight, Cpu, Files, Menu, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { plural } from "@/lib/labels";
import type { BatchSummary } from "@/lib/types";
import { Logo } from "./Logo";
import { useToast } from "./Toast";

function isActive(b: BatchSummary) {
  return b.counts.queued + b.counts.running > 0;
}

function NavItem({ href, icon, children, active }: { href: string; icon: ReactNode; children: ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
        active ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/70 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: batches } = useSWR("batches", api.batches, {
    refreshInterval: (latest) => (latest?.some(isActive) ? 2000 : 0),
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col" onClick={onNavigate}>
      <nav className="space-y-0.5">
        <NavItem href="/app" active={pathname === "/app"} icon={<Files className="size-4" />}>
          Все партии
        </NavItem>
        <NavItem href="/app/new" active={pathname === "/app/new"} icon={<Plus className="size-4" />}>
          Новая партия
        </NavItem>
      </nav>

      <p className="mt-6 mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Недавние</p>
      <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 scrollbar-thin">
        {batches?.slice(0, 12).map((b) => {
          const active = pathname === `/app/batches/${b.id}`;
          return (
            <Link
              key={b.id}
              href={`/app/batches/${b.id}`}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                active ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/70"
              }`}
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  isActive(b) ? "animate-pulse bg-info" : b.counts.error ? "bg-danger" : "bg-accent"
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{b.is_demo ? "Демо: Уютный угол" : b.filename}</span>
              <span className="text-[11px] text-ink-3 tabular-nums">
                {b.counts.done}/{b.total}
              </span>
            </Link>
          );
        })}
        {!batches && [0, 1, 2].map((i) => <div key={i} className="skeleton mx-2.5 my-2 h-4 rounded" />)}
      </div>
    </div>
  );
}

function Meter({ label, left, total }: { label: string; left: number; total: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>{label}</span>
        <span className="tabular-nums">
          {left}/{total}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-ink-3/60" style={{ width: `${(left / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Usage() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data } = useSWR("limits", api.limits, { refreshInterval: 15000 });
  const [resetting, setResetting] = useState(false);

  async function reset() {
    if (!confirm("Удалить ваши партии и вернуть демо «Уютного угла» в исходное состояние?")) return;
    setResetting(true);
    try {
      const batch = await api.resetDemo();
      await mutate(() => true, undefined, { revalidate: true });
      router.push(`/app/batches/${batch.id}`);
      toast.ok("Демо сброшено");
    } catch (e) {
      toast.error(e);
    } finally {
      setResetting(false);
    }
  }

  const mock = data?.provider.startsWith("mock");
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {data && (
        <>
          <div className="flex items-center gap-2 text-xs text-ink-2" title={data.provider}>
            <Cpu className="size-3.5 text-ink-3" />
            <span className="truncate">
              {mock ? "Шаблонный режим, без ИИ" : data.provider.split(":").slice(1).join(":")}
            </span>
          </div>
          <Meter label="Партий в этот час" left={data.batches_left} total={data.batches_per_hour} />
          <Meter label="Генераций в этот час" left={data.generations_left} total={data.generations_per_hour} />
        </>
      )}
      <div className="flex items-center justify-between">
        <button
          onClick={reset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className={`size-3.5 ${resetting ? "animate-spin" : ""}`} />
          Сбросить демо
        </button>
        <Link href="/" className="inline-flex items-center gap-0.5 text-xs text-ink-3 hover:text-ink">
          О проекте <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col p-3">
      <Link href="/" className="flex h-10 items-center px-1.5">
        <Logo />
      </Link>

      <div className="mt-3 mb-5 flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#efe3d3] text-xs font-semibold text-[#7a4d1c]">
          УУ
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">Уютный угол</span>
          <span className="block truncate text-[11px] text-ink-3">Демо-магазин · товары для дома</span>
        </span>
      </div>

      <Suspense fallback={<div className="flex-1" />}>
        <Navigation onNavigate={onNavigate} />
      </Suspense>
      <Usage />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pending = useSWR("batches", api.batches).data?.reduce((n, b) => n + b.counts.queued + b.counts.running, 0);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 text-ink-3" aria-label="Закрыть меню">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Открыть меню" className="-ml-1 p-1 text-ink-2">
            <Menu className="size-5" />
          </button>
          <Link href="/">
            <Logo />
          </Link>
          {!!pending && (
            <span className="ml-auto text-xs text-info">
              в работе {pending} {plural(pending, ["строка", "строки", "строк"])}
            </span>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
