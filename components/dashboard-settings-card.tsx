"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, UserRound } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { createClient } from "@/lib/supabase/client";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DashboardSettingsCardProps = {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
};

const DISPLAY_NAME_AUTOSAVE_MS = 600;

export function DashboardSettingsCard({
  userId,
  fullName,
  avatarUrl: initialAvatarUrl,
  email,
}: DashboardSettingsCardProps) {
  const t = useTranslations("DashboardSettingsCard");
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarSavedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [avatarSaveStatus, setAvatarSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [displayNameInput, setDisplayNameInput] = useState(fullName ?? "");
  const displayNameRef = useRef(fullName ?? "");
  const nameDirtyRef = useRef(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSavedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const namePersistRef = useRef(false);
  const [nameSaveStatus, setNameSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    displayNameRef.current = displayNameInput;
  }, [displayNameInput]);

  useEffect(() => {
    if (nameDirtyRef.current) {
      return;
    }
    setDisplayNameInput(fullName ?? "");
    displayNameRef.current = fullName ?? "";
  }, [fullName]);

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl ?? "");
  }, [initialAvatarUrl]);

  useEffect(
    () => () => {
      if (nameDebounceRef.current) {
        clearTimeout(nameDebounceRef.current);
      }
      if (nameSavedIndicatorRef.current) {
        clearTimeout(nameSavedIndicatorRef.current);
      }
      if (avatarSavedIndicatorRef.current) {
        clearTimeout(avatarSavedIndicatorRef.current);
      }
    },
    [],
  );

  function serverDisplayNameNormalized() {
    return (fullName ?? "").trim();
  }

  function scheduleDisplayNameAutosave() {
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
    }
    nameDebounceRef.current = setTimeout(() => {
      nameDebounceRef.current = null;
      void persistDisplayName();
    }, DISPLAY_NAME_AUTOSAVE_MS);
  }

  async function saveDisplayNameOnce(): Promise<void> {
    const normalized = displayNameRef.current.trim();
    if (normalized === serverDisplayNameNormalized()) {
      nameDirtyRef.current = false;
      setNameSaveStatus("idle");
      return;
    }

    setNameSaveStatus("saving");
    setNameError(null);

    const response = await fetch("/api/profile/full-name", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ fullName: displayNameRef.current }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? t("errors.nameSaveFailed"));
    }

    const latest = displayNameRef.current.trim();
    if (latest !== normalized) {
      await saveDisplayNameOnce();
      return;
    }

    nameDirtyRef.current = false;
    if (nameSavedIndicatorRef.current) {
      clearTimeout(nameSavedIndicatorRef.current);
    }
    setNameSaveStatus("saved");
    nameSavedIndicatorRef.current = setTimeout(() => {
      nameSavedIndicatorRef.current = null;
      setNameSaveStatus("idle");
    }, 2000);
    router.refresh();
  }

  async function persistDisplayName() {
    if (namePersistRef.current) {
      return;
    }
    const normalized = displayNameRef.current.trim();
    if (normalized === serverDisplayNameNormalized()) {
      nameDirtyRef.current = false;
      setNameSaveStatus("idle");
      return;
    }

    namePersistRef.current = true;
    try {
      await saveDisplayNameOnce();
    } catch (error) {
      setNameSaveStatus("idle");
      setNameError(error instanceof Error ? error.message : t("errors.nameSaveFailed"));
    } finally {
      namePersistRef.current = false;
    }
  }

  function handleDisplayNameBlur() {
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = null;
    }
    void persistDisplayName();
  }

  async function persistAvatarUrl(nextUrl: string | null) {
    const response = await fetch("/api/profile/avatar", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ avatarUrl: nextUrl }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? t("errors.photoSaveFailed"));
    }
  }

  function showAvatarSavedBriefly() {
    if (avatarSavedIndicatorRef.current) {
      clearTimeout(avatarSavedIndicatorRef.current);
    }
    setAvatarSaveStatus("saved");
    avatarSavedIndicatorRef.current = setTimeout(() => {
      avatarSavedIndicatorRef.current = null;
      setAvatarSaveStatus("idle");
    }, 2000);
  }

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUploadError(t("upload.errors.imageOnly"));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t("upload.errors.maxSize"));
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setAvatarSaveStatus("saving");

    const filePath = `${userId}/avatar`;
    const supabase = createClient();
    const previousDisplayed = avatarUrl;

    const uploadResult = await supabase.storage.from("profile-photos").upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadResult.error) {
      setUploadError(t("upload.errors.failed"));
      setIsUploading(false);
      setAvatarSaveStatus("idle");
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    setAvatarUrl(publicUrl);

    try {
      await persistAvatarUrl(publicUrl);
      showAvatarSavedBriefly();
      router.refresh();
    } catch (error) {
      setAvatarUrl(previousDisplayed);
      setUploadError(error instanceof Error ? error.message : t("errors.photoSaveFailed"));
      setAvatarSaveStatus("idle");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadError(null);
    setAvatarSaveStatus("saving");
    const previousDisplayed = avatarUrl;
    setAvatarUrl("");
    try {
      await persistAvatarUrl(null);
      showAvatarSavedBriefly();
      router.refresh();
    } catch (error) {
      setAvatarUrl(previousDisplayed);
      setUploadError(error instanceof Error ? error.message : t("errors.photoSaveFailed"));
      setAvatarSaveStatus("idle");
    }
  };

  const initials = (displayNameInput.trim() || email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DashboardPageSection icon={UserRound} title={t("title")} description={t("description")}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">{t("upload.profilePhoto")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("upload.autosaveHint")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => !isUploading && fileInputRef.current?.click()}
              disabled={isUploading}
              className="group relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
              aria-label={t("upload.changePhoto")}
            >
              <Avatar size="lg" className="h-14 w-14">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={t("upload.profileAvatarAlt")} />
                ) : null}
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarFileChange}
              disabled={isUploading}
              className="sr-only"
            />
            {avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRemovePhoto()}
                disabled={isUploading || avatarSaveStatus === "saving"}
              >
                {t("upload.removePhoto")}
              </Button>
            ) : null}
            <p
              className="min-h-[1.25rem] text-xs font-medium text-muted-foreground"
              aria-live="polite"
            >
              {isUploading || avatarSaveStatus === "saving" ? t("actions.saving") : null}
              {avatarSaveStatus === "saved" ? t("fields.nameSaved") : null}
            </p>
          </div>
          {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
        </div>

        <div>
          <Label className="mb-1" htmlFor="settings-display-name">
            {t("fields.displayName")}
          </Label>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            {t("fields.displayNameAutosave")}
          </p>
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Input
              id="settings-display-name"
              type="text"
              maxLength={80}
              value={displayNameInput}
              onChange={(event) => {
                const value = event.target.value;
                displayNameRef.current = value;
                nameDirtyRef.current = true;
                setDisplayNameInput(value);
                setNameError(null);
                if (nameSaveStatus === "saved") {
                  setNameSaveStatus("idle");
                }
                scheduleDisplayNameAutosave();
              }}
              onBlur={handleDisplayNameBlur}
              placeholder={t("fields.displayNamePlaceholder")}
              aria-busy={nameSaveStatus === "saving"}
              autoComplete="name"
              className="w-full min-w-0"
            />
            <p
              className="min-h-[1.25rem] shrink-0 text-xs font-medium text-muted-foreground sm:min-w-[5.5rem]"
              aria-live="polite"
            >
              {nameSaveStatus === "saving" ? t("actions.saving") : null}
              {nameSaveStatus === "saved" ? t("fields.nameSaved") : null}
            </p>
          </div>
          {nameError ? <p className="mt-2 text-xs text-rose-600">{nameError}</p> : null}
        </div>
      </div>
    </DashboardPageSection>
  );
}
