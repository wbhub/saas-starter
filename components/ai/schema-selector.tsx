"use client";

import { useTranslations } from "next-intl";

export function SchemaSelector({
  schemas,
  selected,
  onSelect,
}: {
  schemas: Array<{ key: string; label: string }>;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const t = useTranslations("AiObjectCard");

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="schema-select" className="text-sm font-medium text-muted-foreground">
        {t("schemaSelector.label")}
      </label>
      <select
        id="schema-select"
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
        className="rounded-md border app-border-subtle bg-surface px-2 py-1 text-sm text-foreground"
      >
        {schemas.map((schema) => (
          <option key={schema.key} value={schema.key}>
            {schema.label}
          </option>
        ))}
      </select>
    </div>
  );
}
