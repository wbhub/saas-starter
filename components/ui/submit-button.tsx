"use client";

import { useFormStatus } from "react-dom";
import { type ButtonHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubmitButtonVariant = "primary" | "danger";

const variantClasses: Record<SubmitButtonVariant, string> = {
  primary: "bg-indigo-500 text-white hover:bg-indigo-400",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
};

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
      disabled={isPending || disabled}
      className={cn("h-auto px-4 py-2", variantClasses[variant], className)}
      {...rest}
    >
      {isPending ? pendingLabel : idleLabel}
    </Button>
  );
}
