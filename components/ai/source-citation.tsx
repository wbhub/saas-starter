"use client";

export function SourceCitation({
  sources,
}: {
  sources: Array<{
    title?: string;
    url?: string;
    snippet?: string;
  }>;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5 last:mb-0">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, index) => (
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border app-border-subtle bg-card px-2 py-1 text-xs text-foreground hover:bg-accent"
            title={source.snippet}
          >
            <svg
              className="h-3 w-3 shrink-0 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <span className="max-w-[200px] truncate">
              {source.title ?? source.url ?? `Source ${index + 1}`}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
