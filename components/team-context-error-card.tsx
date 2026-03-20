export function TeamContextErrorCard() {
  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        Could not load team access
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        We hit a temporary issue loading your team context. Please refresh and try again.
      </p>
    </section>
  );
}
