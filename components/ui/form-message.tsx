type FormMessageProps = {
  status: "error" | "success" | "idle";
  message: string | null;
  /** Optional HTML id for aria-describedby linkage. */
  id?: string;
};

const errorClasses =
  "border border-destructive/35 bg-destructive/10 text-destructive";

const successClasses = "bg-muted text-muted-foreground";

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
