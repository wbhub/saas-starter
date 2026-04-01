"use client";

type MessageMetadataProps = {
  model?: string;
  timestamp?: string;
  promptTokens?: number;
  completionTokens?: number;
  toolCallCount?: number;
  durationMs?: number;
};

function formatTokenCount(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MessageMetadata({
  model,
  promptTokens,
  completionTokens,
  toolCallCount,
  durationMs,
}: MessageMetadataProps) {
  const chips: Array<{ label: string; value: string }> = [];

  if (model) {
    chips.push({ label: "Model", value: model });
  }
  if (promptTokens !== undefined && completionTokens !== undefined) {
    const total = promptTokens + completionTokens;
    if (total > 0) {
      chips.push({ label: "Tokens", value: formatTokenCount(total) });
    }
  }
  if (durationMs !== undefined && durationMs > 0) {
    chips.push({ label: "Time", value: formatDuration(durationMs) });
  }
  if (toolCallCount !== undefined && toolCallCount > 0) {
    chips.push({ label: "Tools", value: String(toolCallCount) });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground bg-accent"
          title={chip.label}
        >
          {chip.value}
        </span>
      ))}
    </div>
  );
}
