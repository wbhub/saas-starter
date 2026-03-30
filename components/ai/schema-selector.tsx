"use client";

import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <label
        htmlFor="schema-select"
        className="text-sm font-medium leading-none text-muted-foreground sm:pt-2.5"
      >
        {t("schemaSelector.label")}
      </label>
      <Select
        value={selected}
        onValueChange={(value) => {
          if (value != null) {
            onSelect(value);
          }
        }}
      >
        <SelectTrigger
          id="schema-select"
          size="default"
          className={cn(
            "h-10 w-fit max-w-full min-w-0 shrink-0 justify-between",
            "border-border/80 bg-background shadow-sm",
            "transition-[box-shadow,background-color,border-color]",
            "hover:bg-muted/30 hover:border-border",
            "data-popup-open:border-ring/60 data-popup-open:bg-muted/20 data-popup-open:shadow-md data-popup-open:ring-2 data-popup-open:ring-ring/25",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" sideOffset={6} className="max-h-72">
          {schemas.map((schema) => (
            <SelectItem key={schema.key} value={schema.key}>
              {schema.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
