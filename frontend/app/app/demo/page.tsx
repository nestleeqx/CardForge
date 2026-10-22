"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Короткая ссылка с лендинга: сразу открывает демо-партию посетителя. */
export default function DemoRedirect() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .batches()
      .then((batches) => {
        const demo = batches.find((b) => b.is_demo) ?? batches[0];
        router.replace(demo ? `/app/batches/${demo.id}` : "/app");
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <div className="grid min-h-[50vh] place-items-center text-sm text-ink-2">
      {error ? (
        <p className="text-danger">{error}</p>
      ) : (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Открываем демо-партию «Уютного угла»…
        </span>
      )}
    </div>
  );
}
