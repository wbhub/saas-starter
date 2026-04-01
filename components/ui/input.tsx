import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const editableClasses =
  "flex h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

const readonlyClasses =
  "flex h-10 w-full min-w-0 rounded-lg border border-input bg-muted/60 px-3 py-2 text-base text-muted-foreground outline-none md:text-sm dark:bg-input/30";

type InputProps = {
  variant?: "editable" | "readonly";
} & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = "editable", className, readOnly, ...rest },
  ref,
) {
  const isReadonly = variant === "readonly" || readOnly;

  return (
    <input
      data-slot="input"
      ref={ref}
      readOnly={isReadonly}
      className={cn(isReadonly ? readonlyClasses : editableClasses, className)}
      {...rest}
    />
  );
});
