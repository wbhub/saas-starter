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
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
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
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("title")}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t("description")}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <div className="rounded-lg border app-border-subtle p-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t("upload.profilePhoto")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
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
              className="block text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100 dark:text-slate-200 dark:file:border-slate-700 dark:file:bg-slate-900 dark:file:text-slate-200 dark:hover:file:bg-slate-800"
            />
            <button
              type="button"
              onClick={uploadAvatar}
              disabled={isUploading}
              className="rounded-lg border app-border-subtle px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isUploading ? t("upload.uploading") : t("upload.uploadPhoto")}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => setAvatarUrl("")}
                className="rounded-lg border app-border-subtle px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("upload.removePhoto")}
              </button>
            ) : null}
          </div>
          {uploadMessage ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{uploadMessage}</p>
          ) : null}
          {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("fields.displayName")}
          </span>
          <input
            type="text"
            name="fullName"
            maxLength={80}
            defaultValue={fullName ?? ""}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder={t("fields.displayNamePlaceholder")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("fields.email")}
          </span>
          <input
            type="email"
            value={email ?? ""}
            readOnly
            className="w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-slate-600 outline-none dark:text-slate-300"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
              : "app-surface-subtle text-slate-700 dark:text-slate-200"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
