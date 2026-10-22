"use client";

import { Layers, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { plural } from "@/lib/labels";
import { useToast } from "./Toast";

function NavLinks() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Партии", active: pathname === "/" || pathname.startsWith("/batches") },
    { href: "/new", label: "Новая партия", active: pathname === "/new" },
  ];
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            l.active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

function ProviderBadge() {
  const { data } = useSWR("limits", api.limits, { refreshInterval: 15000 });
  if (!data) return null;
  const mock = data.provider.startsWith("mock");
  return (
    <div className="hidden items-center gap-3 text-xs text-slate-500 lg:flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
          mock ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
        }`}
        title={data.provider}
      >
        <Sparkles className="size-3.5" />
        {mock ? "Шаблонный режим" : data.provider.split(":").slice(1).join(":")}
      </span>
      <span>
        Осталось: {data.batches_left} {plural(data.batches_left, ["партия", "партии", "партий"])} ·{" "}
        {data.generations_left} {plural(data.generations_left, ["генерация", "генерации", "генераций"])} в час
      </span>
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [resetting, setResetting] = useState(false);

  async function reset() {
    if (!confirm("Удалить ваши партии и вернуть демо «Уютного угла» в исходное состояние?")) return;
    setResetting(true);
    try {
      const batch = await api.resetDemo();
      await mutate(() => true, undefined, { revalidate: true });
      router.push(`/batches/${batch.id}`);
      toast.ok("Демо сброшено");
    } catch (e) {
      toast.error(e);
    } finally {
      setResetting(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
            <Layers className="size-4.5" />
          </span>
          CardForge
        </Link>
        <Suspense fallback={<div className="h-8 w-48" />}>
          <NavLinks />
        </Suspense>
        <div className="ml-auto flex items-center gap-3">
          <ProviderBadge />
          <button
            onClick={reset}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className={`size-4 ${resetting ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Сбросить демо</span>
          </button>
        </div>
      </div>
    </header>
  );
}
