import { Suspense } from "react";
import { BatchView } from "@/components/BatchView";

export default function BatchPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
      <BatchView />
    </Suspense>
  );
}
