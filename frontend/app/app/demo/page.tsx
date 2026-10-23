"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";

/** Короткая ссылка с лендинга: сразу открывает демо-партию посетителя. */
export default function DemoRedirect() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .batches()
      // Если посетитель удалил демо-партию, «Открыть демо» возвращает её, не трогая остальные
      .then(async (batches) => batches.find((b) => b.is_demo) ?? (await api.restoreDemo()))
      .then((demo) => {
        mutate("batches");
        router.replace(`/app/batches/${demo.id}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [router, mutate]);

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
