"use client";

import { ChangeEvent, useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  updateDashboardSettings,
  type UpdateDashboardSettingsState,
} from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";

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

function SaveButton({ pendingLabel, idleLabel }: { pendingLabel: string; idleLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

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
      <p className="mt-2 text-sm text-muted-foreground">
        {t("description")}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <div className="rounded-lg border app-border-subtle p-3">
          <p className="text-sm font-medium text-foreground">{t("upload.profilePhoto")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-subtle text-xs text-muted-foreground">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={t("upload.profileAvatarAlt")} className="h-full w-full object-cover" />
              ) : (
                t("upload.noPhoto")
              )}
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileSelection}
              className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border-subtle file:bg-surface-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-muted-foreground hover:file:bg-surface-hover"
            />
            <button
              type="button"
              onClick={uploadAvatar}
              disabled={isUploading}
              className="rounded-lg border app-border-subtle px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover disabled:opacity-60"
            >
              {isUploading ? t("upload.uploading") : t("upload.uploadPhoto")}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => setAvatarUrl("")}
                className="rounded-lg border app-border-subtle px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover"
              >
                {t("upload.removePhoto")}
              </button>
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
          <input
            type="text"
            name="fullName"
            maxLength={80}
            defaultValue={fullName ?? ""}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            placeholder={t("fields.displayNamePlaceholder")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.email")}
          </span>
          <input
            type="email"
            value={email ?? ""}
            readOnly
            className="w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-muted-foreground outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("fields.emailHint")}
          </p>
        </label>

        <SaveButton pendingLabel={t("actions.saving")} idleLabel={t("actions.saveSettings")} />
      </form>

      {state.message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state.status === "error"
              ? "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200"
              : "app-surface-subtle text-muted-foreground"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
