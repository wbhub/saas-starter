"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, Trash2, UserRound } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { createClient } from "@/lib/supabase/client";
import { clientPatchJson } from "@/lib/http/client-fetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

    await clientPatchJson("/api/profile/full-name", { fullName: displayNameRef.current }, {
      fallbackErrorMessage: t("errors.nameSaveFailed"),
    });

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
    await clientPatchJson("/api/profile/avatar", { avatarUrl: nextUrl }, {
      fallbackErrorMessage: t("errors.photoSaveFailed"),
    });
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

  function openAvatarFilePicker() {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }

  const avatarBusy = isUploading || avatarSaveStatus === "saving";

  return (
    <DashboardPageSection icon={UserRound} title={t("title")} description={t("description")}>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 lg:gap-4">
          <div className="flex shrink-0 justify-center sm:justify-start">
            {avatarUrl ? (
              <div className="group relative inline-block">
                <Avatar className="size-16 shrink-0 rounded-full after:hidden">
                  <AvatarImage src={avatarUrl} alt={t("upload.profileAvatarAlt")} />
                  <AvatarFallback className="text-base">{initials}</AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "absolute inset-0 z-[1] flex items-center justify-center rounded-full bg-black/55 p-2 opacity-0 transition-opacity duration-150",
                    "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                    "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                    avatarBusy && "pointer-events-none opacity-0 group-hover:opacity-0",
                  )}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      void handleRemovePhoto();
                    }}
                    disabled={avatarBusy}
                    className="rounded-full p-1.5 text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("upload.removePhotoAria")}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAvatarFilePicker}
                disabled={avatarBusy}
                className="flex size-16 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted/25 text-muted-foreground/90 transition hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                aria-label={t("upload.uploadPhotoAria")}
              >
                <Camera className="size-4" aria-hidden />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarFileChange}
              disabled={isUploading}
              className="sr-only"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <Label className="mb-1 block" htmlFor="settings-display-name">
                {t("fields.displayName")}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
                  className="w-full min-w-0 max-w-md"
                />
                {nameSaveStatus === "saving" ||
                nameSaveStatus === "saved" ||
                avatarBusy ||
                avatarSaveStatus === "saved" ? (
                  <div className="flex shrink-0 flex-col justify-center gap-0.5 sm:min-h-10 sm:min-w-[5.5rem]">
                    {nameSaveStatus === "saving" || nameSaveStatus === "saved" ? (
                      <p
                        className="text-xs font-medium leading-none text-muted-foreground"
                        aria-live="polite"
                      >
                        {nameSaveStatus === "saving" ? t("actions.saving") : t("fields.nameSaved")}
                      </p>
                    ) : null}
                    {avatarBusy || avatarSaveStatus === "saved" ? (
                      <p
                        className="text-xs font-medium leading-none text-muted-foreground"
                        aria-live="polite"
                      >
                        {avatarBusy ? t("actions.saving") : t("fields.nameSaved")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {nameError ? <p className="mt-2 text-xs text-destructive">{nameError}</p> : null}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t("profileRowHint")}</p>

        {uploadError ? <p className="mt-2 text-xs text-destructive">{uploadError}</p> : null}
      </div>
    </DashboardPageSection>
  );
}
