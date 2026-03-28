export default function DashboardLoading() {
  return (
    <div data-testid="dashboard-loading-content" className="space-y-8">
      <div>
        <div className="h-9 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2.5 h-5 w-72 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
