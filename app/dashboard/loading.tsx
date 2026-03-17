export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[color:var(--background)] p-6">
      <div className="mx-auto max-w-5xl animate-pulse space-y-4">
        <div className="h-24 rounded-xl app-surface-subtle" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 rounded-xl app-surface-subtle" />
          <div className="h-40 rounded-xl app-surface-subtle" />
        </div>
        <div className="h-28 rounded-xl app-surface-subtle" />
      </div>
    </main>
  );
}
