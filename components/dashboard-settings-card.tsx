"use client";

import { ChangeEvent, useActionState, useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Camera, Loader2, Check, Trash2 } from "lucide-react";
import {
  updateDashboardSettings,
  type UpdateDashboardSettingsState,
} from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [state, formAction, isPending] = useActionState(updateDashboardSettings, initialState);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // To avoid setting state synchronously in an effect (which causes cascading renders),
  // we derive the showSaved state during render when the status changes to success.
  const [showSaved, setShowSaved] = useState(false);
  const [prevStatus, setPrevStatus] = useState(state.status);

  if (state.status !== prevStatus) {
    setPrevStatus(state.status);
    if (state.status === "success") {
      setShowSaved(true);
    }
  }

  useEffect(() => {
    if (showSaved) {
      const hideTimer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(hideTimer);
    }
  }, [showSaved]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const initials = (fullName ?? email ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

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
    
    // Append a timestamp to bust the browser cache so the new image shows up immediately
    const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
    
    // #region agent log
    fetch('http://127.0.0.1:7682/ingest/9890b261-4ef1-42f4-9a39-56fb9758768c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a55fd0'},body:JSON.stringify({sessionId:'a55fd0',location:'components/dashboard-settings-card.tsx:98',message:'Setting avatar URL',data:{urlWithCacheBuster},timestamp:Date.now(),runId:'run1',hypothesisId:'1'})}).catch(()=>{});
    // #endregion

    // We update the local state immediately so the UI feels fast
    setAvatarUrl(urlWithCacheBuster);
    setIsUploading(false);
    
    // We must wait for React to flush the new avatarUrl to the hidden input's value
    // before we submit the form, otherwise we submit the old URL.
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 100);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl("");
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 100);
  };

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-6 sm:p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>

      <form ref={formRef} action={formAction} className="mt-8">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="avatarUrl" value={avatarUrl} />

        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative flex-shrink-0 group">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="relative flex h-20 w-20 items-center justify-center rounded-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden"
              aria-label={t("upload.changePhoto")}
            >
              <Avatar size="lg" className="h-20 w-20">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={t("upload.profileAvatarAlt")} />
                ) : null}
                <AvatarFallback className="text-xl">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </div>

              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/50 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground" />
                </div>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileSelection}
              className="sr-only"
            />

            {!avatarUrl && !isUploading && (
              <div className="absolute bottom-0 right-0 rounded-full border-2 border-background bg-muted p-1.5 text-muted-foreground pointer-events-none">
                <Camera className="h-3.5 w-3.5" />
              </div>
            )}

            {avatarUrl && !isUploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemovePhoto();
                }}
                className="absolute -right-1 -top-1 rounded-full border-2 border-background bg-muted p-1.5 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground transition-all opacity-0 group-hover:opacity-100 z-10"
                aria-label={t("upload.removePhoto")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between mb-1.5">
              <Label>{t("fields.displayName")}</Label>
              <div className="flex items-center h-5">
                {isPending && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{t("actions.saving")}</span>
                  </div>
                )}
                {showSaved && !isPending && state.status === "success" && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>Saved</span>
                  </div>
                )}
              </div>
            </div>
            <Input
              type="text"
              name="fullName"
              maxLength={80}
              defaultValue={fullName ?? ""}
              placeholder={t("fields.displayNamePlaceholder")}
              onBlur={() => formRef.current?.requestSubmit()}
              className="w-full"
            />
            {uploadError ? <p className="mt-2 text-xs text-rose-600">{uploadError}</p> : null}
          </div>
        </div>
      </form>

      {state.status === "error" && (
        <div className="mt-4">
          <FormMessage status={state.status} message={state.message} />
        </div>
      )}
    </section>
  );
}
