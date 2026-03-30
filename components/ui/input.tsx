import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const editableClasses =
  "w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus:ring-2";

const readonlyClasses =
  "w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-muted-foreground outline-none";

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
      ref={ref}
      readOnly={isReadonly}
      className={cn(isReadonly ? readonlyClasses : editableClasses, className)}
      {...rest}
    />
  );
});
