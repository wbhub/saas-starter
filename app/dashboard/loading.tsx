export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header skeleton */}
      <div className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-lg bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
            {/* Sidebar skeleton */}
            <div className="space-y-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              <div className="my-3 h-px bg-border" />
              <div className="space-y-1">
                <div className="h-8 animate-pulse rounded-lg bg-muted" />
                <div className="h-8 animate-pulse rounded-lg bg-muted" />
                <div className="h-8 animate-pulse rounded-lg bg-muted" />
                <div className="h-8 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>

            {/* Main content skeleton */}
            <div className="space-y-6">
              <div>
                <div className="h-7 w-48 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-44 animate-pulse rounded-xl bg-muted" />
                <div className="h-44 animate-pulse rounded-xl bg-muted" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="h-20 animate-pulse rounded-xl bg-muted" />
                <div className="h-20 animate-pulse rounded-xl bg-muted" />
                <div className="h-20 animate-pulse rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
