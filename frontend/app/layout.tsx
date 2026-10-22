import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "CardForge — карточки товаров для Ozon и Wildberries",
  description:
    "Загрузите таблицу с товарами и получите готовые названия, описания, характеристики и ключевые слова для маркетплейсов.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ToastProvider>
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500">
            CardForge — демо-проект. Магазин «Уютный угол» и товары вымышлены.
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
