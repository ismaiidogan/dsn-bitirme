"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Navbar } from "@/components/navbar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen">
      <Navbar />
      <main className="flex-1 ml-60 p-8">
        <div className="mb-6 flex justify-end">
          <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card/85 px-2 py-1.5 shadow-[0_8px_24px_-18px_hsl(var(--foreground)/0.45)] backdrop-blur">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
