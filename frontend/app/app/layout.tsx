import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

// Рабочее пространство персональное: у каждого посетителя свои партии, индексировать нечего
export const metadata: Metadata = {
  title: "Рабочее пространство",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}
