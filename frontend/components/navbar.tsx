"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Database, LayoutDashboard, Upload, Monitor, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { getRolePreference, RolePreference } from "@/lib/role";
import { useLanguage } from "@/contexts/language-context";

const navItems = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/upload", labelKey: "nav.upload", icon: Upload },
  { href: "/agent", labelKey: "nav.agent", icon: Monitor },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<RolePreference | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    // Sadece client tarafında localStorage'dan okumak için
    const pref = getRolePreference();
    setRole(pref);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
        <Database className="h-6 w-6 text-primary" />
        <span className="font-bold text-lg tracking-tight">DSN</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const dimmed =
            (role === "consumer" && item.href === "/agent") ||
            (role === "provider" && (item.href === "/dashboard" || item.href === "/upload"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : dimmed
                  ? "text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* User & logout */}
      <div className="border-t border-border p-3 space-y-1">
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {t("common.logout")}
        </button>
      </div>
    </aside>
  );
}
