import { cn } from "@/lib/utils";

type FormMessageProps = {
  status: "error" | "success" | "idle";
  message: string | null;
  /** Optional HTML id for aria-describedby linkage. */
  id?: string;
};

const errorClasses = "border border-destructive/35 bg-destructive/10 text-destructive";

const successClasses =
  "border border-success/30 bg-success/10 text-success-foreground dark:text-success";

const idleClasses = "border border-border bg-muted/60 text-muted-foreground";

export function FormMessage({ status, message, id }: FormMessageProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={cn(
        "mt-3 rounded-lg px-3 py-2 text-sm",
        status === "error" ? errorClasses : status === "success" ? successClasses : idleClasses,
      )}
    >
      {message}
    </p>
  );
}
