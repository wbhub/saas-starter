type FormMessageProps = {
  status: "error" | "success" | "idle";
  message: string | null;
  /** Optional HTML id for aria-describedby linkage. */
  id?: string;
};

const errorClasses =
  "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200";

const successClasses = "app-surface-subtle text-muted-foreground";

export function FormMessage({ status, message, id }: FormMessageProps) {
  if (!message) return null;

  return (
    <p
      id={id}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${
        status === "error" ? errorClasses : successClasses
      }`}
    >
      {message}
    </p>
  );
}
