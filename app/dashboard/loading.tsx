export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl animate-pulse space-y-4">
        <div className="h-24 rounded-xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 rounded-xl bg-slate-200" />
          <div className="h-40 rounded-xl bg-slate-200" />
        </div>
        <div className="h-28 rounded-xl bg-slate-200" />
      </div>
    </main>
  );
}
