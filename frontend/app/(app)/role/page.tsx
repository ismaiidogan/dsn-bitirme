"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, HardDrive, CloudUpload } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getRolePreference, setRolePreference, getRoleHomePath, RolePreference } from "@/lib/role";
import { useLanguage } from "@/contexts/language-context";

export default function RoleSelectPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const role = getRolePreference();
    if (role) {
      // Tercih zaten yapılmışsa, doğrudan ilgili ana sayfaya yönlendir
      router.replace(getRoleHomePath(role));
    } else {
      setReady(true);
    }
  }, [router]);

  const chooseRole = (role: RolePreference) => {
    setRolePreference(role);
    router.push(getRoleHomePath(role));
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-7 w-7" />
            <span className="text-2xl font-bold tracking-tight">DSN</span>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            {t("roleSelect.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dosya sahibi (consumer) */}
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudUpload className="h-5 w-5 text-primary" />
                {t("roleSelect.consumerCardTitle")}
              </CardTitle>
              <CardDescription>
                {t("roleSelect.consumerCardDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4 list-disc list-inside">
                <li>{t("roleSelect.consumerBullet1")}</li>
                <li>{t("roleSelect.consumerBullet2")}</li>
                <li>{t("roleSelect.consumerBullet3")}</li>
              </ul>
              <Button className="w-full" onClick={() => chooseRole("consumer")}>
                {t("roleSelect.consumerAction")}
              </Button>
            </CardContent>
          </Card>

          {/* Depolama sağlayıcı (provider) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-emerald-400" />
                {t("roleSelect.providerCardTitle")}
              </CardTitle>
              <CardDescription>
                {t("roleSelect.providerCardDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1 mb-4 list-disc list-inside">
                <li>{t("roleSelect.providerBullet1")}</li>
                <li>{t("roleSelect.providerBullet2")}</li>
                <li>{t("roleSelect.providerBullet3")}</li>
              </ul>
              <Button variant="outline" className="w-full" onClick={() => chooseRole("provider")}>
                {t("roleSelect.providerAction")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

