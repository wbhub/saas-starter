"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type IntercomUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  createdAt?: string | null;
};

type IntercomProviderProps = {
  appId?: string;
  user?: IntercomUser | null;
};

type IntercomSettings = {
  app_id: string;
  user_id?: string;
  email?: string;
  name?: string;
  created_at?: number;
};

type IntercomCommand = (
  command: string,
  ...args: unknown[]
) => void;

declare global {
  interface Window {
    Intercom?: IntercomCommand & { q?: unknown[] };
    intercomSettings?: IntercomSettings;
  }
}

const INTERCOM_SCRIPT_ID = "intercom-widget-script";
const INTERCOM_BASE_URL = "https://widget.intercom.io/widget/";

function buildSettings(appId: string, user?: IntercomUser | null): IntercomSettings {
  const settings: IntercomSettings = {
    app_id: appId,
  };

  if (user?.id) {
    settings.user_id = user.id;
  }

  if (user?.email) {
    settings.email = user.email;
  }

  if (user?.name) {
    settings.name = user.name;
  }

  if (user?.createdAt) {
    const createdAt = Math.floor(new Date(user.createdAt).getTime() / 1000);
    if (!Number.isNaN(createdAt)) {
      settings.created_at = createdAt;
    }
  }

  return settings;
}

function loadIntercomScript(appId: string) {
  if (document.getElementById(INTERCOM_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = INTERCOM_SCRIPT_ID;
  script.async = true;
  script.src = `${INTERCOM_BASE_URL}${appId}`;
  document.head.appendChild(script);
}

export function IntercomProvider({ appId, user }: IntercomProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const settings = useMemo(() => {
    if (!appId) {
      return null;
    }
    return buildSettings(appId, user);
  }, [appId, user]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    window.intercomSettings = settings;

    if (typeof window.Intercom === "function") {
      window.Intercom("shutdown");
      window.Intercom("boot", settings);
      return;
    }

    const intercomStub: IntercomCommand & { q?: unknown[] } = (
      ...args: unknown[]
    ) => {
      intercomStub.q = intercomStub.q ?? [];
      intercomStub.q.push(args);
    };

    window.Intercom = intercomStub;
    loadIntercomScript(settings.app_id);
    window.Intercom("boot", settings);
  }, [settings]);

  useEffect(() => {
    if (!appId || typeof window.Intercom !== "function") {
      return;
    }

    // Ensure SPA route changes are tracked.
    window.Intercom("update", {
      last_request_at: Math.floor(Date.now() / 1000),
    });
  }, [appId, pathname, searchParams]);

  return null;
}
