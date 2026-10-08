export default function Loading() {
  return (
    <main className="route-loading" aria-busy="true" aria-live="polite">
      <div className="route-loading-card">
        <span className="route-loading-spinner" aria-hidden="true" />
        <div>
          <p className="route-loading-title">Loading page</p>
          <p className="route-loading-copy">Preparing latest notices...</p>
        </div>
      </div>
    </main>
  );
}
