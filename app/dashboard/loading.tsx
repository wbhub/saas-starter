export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header skeleton */}
      <div className="border-b app-border-subtle">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-2xl bg-muted" />
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-16 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1">
        <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
            {/* Sidebar skeleton */}
            <div className="space-y-4">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="my-4 h-px bg-border" />
              <div className="space-y-1.5">
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>

            {/* Main content skeleton */}
            <div className="space-y-8">
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
          </div>
        </div>
      </div>
    </div>
  );
}
