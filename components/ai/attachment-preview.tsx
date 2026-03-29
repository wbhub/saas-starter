"use client";

export function AttachmentPreview({
  attachments,
}: {
  attachments: Array<{
    mediaType?: string;
    filename?: string;
    url?: string;
  }>;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 last:mb-0">
      {attachments.map((attachment, index) => {
        const isImage = attachment.mediaType?.startsWith("image/");
        if (isImage && attachment.url) {
          return (
            <div key={index} className="overflow-hidden rounded-md border app-border-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt={attachment.filename ?? "Attachment"}
                className="max-h-[120px] max-w-[200px] object-cover"
              />
            </div>
          );
        }
        return (
          <div
            key={index}
            className="flex items-center gap-1.5 rounded-md border app-border-subtle bg-surface px-2 py-1"
          >
            <svg
              className="h-4 w-4 shrink-0 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span className="max-w-[150px] truncate text-xs text-foreground">
              {attachment.filename ?? "File"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
