"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { DashboardNav, type DashboardTeamUiMode } from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type DashboardMobileNavProps = {
  teamUiMode: DashboardTeamUiMode;
  showAiNav: boolean;
};

export function DashboardMobileNav({ teamUiMode, showAiNav }: DashboardMobileNavProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full border-border/80 bg-background/95 shadow-sm"
          onClick={() => setOpen(true)}
          aria-label={t("DashboardSidebar.appDashboard")}
        >
          <Menu className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">{t("DashboardSidebar.appDashboard")}</span>
        </Button>

        <SheetContent side="left" className="p-0">
          <SheetHeader className="border-b border-border/70 pb-4">
            <SheetTitle>{t("DashboardSidebar.appDashboard")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <DashboardNav
              teamUiMode={teamUiMode}
              showAiNav={showAiNav}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
