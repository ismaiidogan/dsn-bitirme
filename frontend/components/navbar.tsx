"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Database,
  LayoutDashboard,
  Upload,
  Monitor,
  Settings,
  LogOut,
  CreditCard,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { getRolePreference, RolePreference, ROLE_CHANGED_EVENT } from "@/lib/role";
import { useLanguage } from "@/contexts/language-context";

const navItems = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/upload", labelKey: "nav.upload", icon: Upload },
  { href: "/agent", labelKey: "nav.agent", icon: Monitor },
  { href: "/billing", labelKey: "nav.billing", icon: CreditCard },
  { href: "/earnings", labelKey: "nav.earnings", icon: Wallet },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<RolePreference | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const syncRole = () => setRole(getRolePreference());
    syncRole();

    const onStorage = (event: StorageEvent) => {
      if (event.key === "dsn_role") syncRole();
    };
    const onRoleChanged = () => syncRole();

    window.addEventListener("storage", onStorage);
    window.addEventListener(ROLE_CHANGED_EVENT, onRoleChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ROLE_CHANGED_EVENT, onRoleChanged);
    };
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
        {navItems
          .filter((item) => {
            if (!role) return item.href !== "/earnings";
            if (role === "consumer") return item.href !== "/agent" && item.href !== "/earnings";
            if (role === "provider") return item.href !== "/dashboard" && item.href !== "/upload" && item.href !== "/billing";
            return true;
          })
          .map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
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
