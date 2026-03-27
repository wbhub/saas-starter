export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)]">
      {/* Header skeleton */}
      <div className="border-b app-border-subtle">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-2xl app-surface-subtle" />
            <div className="h-5 w-28 animate-pulse rounded-md app-surface-subtle" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg app-surface-subtle" />
            <div className="h-9 w-20 animate-pulse rounded-lg app-surface-subtle" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
            {/* Sidebar skeleton */}
            <div className="animate-pulse rounded-2xl app-surface-subtle lg:h-[560px]" />

            {/* Main content skeleton */}
            <div className="space-y-6">
              <div className="h-32 animate-pulse rounded-2xl app-surface-subtle" />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="h-48 animate-pulse rounded-2xl app-surface-subtle" />
                <div className="h-48 animate-pulse rounded-2xl app-surface-subtle" />
              </div>
              <div className="h-6 w-32 animate-pulse rounded-md app-surface-subtle" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="h-24 animate-pulse rounded-2xl app-surface-subtle" />
                <div className="h-24 animate-pulse rounded-2xl app-surface-subtle" />
                <div className="h-24 animate-pulse rounded-2xl app-surface-subtle" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
