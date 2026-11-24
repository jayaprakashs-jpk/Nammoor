// Shown while a module's code downloads. Plain CSS, no JS work.
export function ModuleLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
