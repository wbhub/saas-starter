"use client";

import { ChangeEvent, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import {
  updateDashboardSettings,
  type UpdateDashboardSettingsState,
} from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";

type DashboardSettingsCardProps = {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  csrfToken: string;
};

const initialState: UpdateDashboardSettingsState = {
  status: "idle",
  message: null,
};

export function DashboardSettingsCard({
  userId,
  fullName,
  avatarUrl: initialAvatarUrl,
  email,
  csrfToken,
}: DashboardSettingsCardProps) {
  const t = useTranslations("DashboardSettingsCard");
  const [state, formAction] = useActionState(updateDashboardSettings, initialState);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const selectedFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initials = (fullName ?? email ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    selectedFileRef.current = selectedFile;
    setUploadError(null);
    if (selectedFile) {
      setUploadMessage(t("upload.ready", { name: selectedFile.name }));
    } else {
      setUploadMessage(null);
    }
  };

  const uploadAvatar = async () => {
    const file = selectedFileRef.current;
    if (!file) {
      setUploadError(t("upload.errors.selectImage"));
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

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    const filePath = `${userId}/avatar`;
    const supabase = createClient();

    const uploadResult = await supabase.storage.from("profile-photos").upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadResult.error) {
      setUploadError(t("upload.errors.failed"));
      setIsUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    setAvatarUrl(publicUrl);
    setUploadMessage(t("upload.success"));
    setIsUploading(false);
  };

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <div className="rounded-lg border app-border-subtle p-3">
          <p className="text-sm font-medium text-foreground">{t("upload.profilePhoto")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("upload.changePhoto")}
            >
              <Avatar size="lg" className="h-14 w-14">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={t("upload.profileAvatarAlt")} />
                ) : null}
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileSelection}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={uploadAvatar}
              disabled={isUploading}
            >
              {isUploading ? t("upload.uploading") : t("upload.uploadPhoto")}
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAvatarUrl("")}
              >
                {t("upload.removePhoto")}
              </Button>
            ) : null}
          </div>
          {uploadMessage ? (
            <p className="mt-2 text-xs text-muted-foreground">{uploadMessage}</p>
          ) : null}
          {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.displayName")}
          </span>
          <Input
            type="text"
            name="fullName"
            maxLength={80}
            defaultValue={fullName ?? ""}
            placeholder={t("fields.displayNamePlaceholder")}
          />
        </label>

        <SubmitButton pendingLabel={t("actions.saving")} idleLabel={t("actions.saveSettings")} />
      </form>

      <FormMessage status={state.status} message={state.message} />
    </section>
  );
}
