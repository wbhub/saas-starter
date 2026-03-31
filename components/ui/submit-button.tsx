"use client";

import { useFormStatus } from "react-dom";
import { type ButtonHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubmitButtonVariant = "primary" | "danger";

type SubmitButtonProps = {
  pendingLabel: string;
  idleLabel: string;
  variant?: SubmitButtonVariant;
  /** Override for manual loading state (bypasses useFormStatus). */
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;

export function SubmitButton({
  pendingLabel,
  idleLabel,
  variant = "primary",
  loading,
  disabled,
  className,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isPending = loading ?? pending;

  return (
    <Button
      type="submit"
      variant={variant === "danger" ? "destructive" : "default"}
      disabled={isPending || disabled}
      className={cn("h-auto px-4 py-2", className)}
      {...rest}
    >
      {isPending ? pendingLabel : idleLabel}
    </Button>
  );
}
