"use client";

import * as React from "react";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";

import { cn } from "@/lib/utils";

type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<Value extends string> = {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  className?: string;
  itemClassName?: string;
  "aria-label"?: string;
};

export function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: SegmentedControlProps<Value>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(nextValues) => {
        const nextValue = nextValues[0];
        if (nextValue) {
          onValueChange(nextValue as Value);
        }
      }}
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-background/70 p-1",
        className,
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
            "hover:text-foreground data-pressed:bg-foreground data-pressed:text-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            itemClassName,
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
