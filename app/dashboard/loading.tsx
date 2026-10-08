export default function DashboardLoading() {
  return (
    <div style={styles.container}>
      <style>{skeletonStyles}</style>

      {/* Sidebar Skeleton */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.skeletonBox} />
          <div style={styles.skeletonText} />
        </div>

        <nav style={styles.sidebarNav}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={styles.skeletonItem} />
          ))}
        </nav>
      </aside>

      {/* Main Content Skeleton */}
      <main style={styles.main}>
        {/* Topbar Skeleton */}
        <header style={styles.topbar}>
          <div style={styles.topbarTitle}>
            <div style={{ ...styles.skeletonBox, width: "200px" }} />
            <div style={{ ...styles.skeletonText, width: "300px", marginTop: "8px" }} />
          </div>
        </header>

        {/* Cards Grid Skeleton */}
        <section style={styles.cardsGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={styles.cardSkeleton}>
              <div style={{ ...styles.skeletonBox, height: "24px" }} />
              <div style={{ ...styles.skeletonText, marginTop: "12px" }} />
              <div style={{ ...styles.skeletonText, marginTop: "8px" }} />
              <div style={{ ...styles.skeletonText, marginTop: "8px", width: "80%" }} />
            </div>
          ))}
        </section>

        {/* Pagination Skeleton */}
        <div style={styles.pagination}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.skeletonBox,
                width: "40px",
                height: "40px",
                borderRadius: "4px",
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#f9fafb",
  },
  sidebar: {
    width: "250px",
    backgroundColor: "white",
    borderRight: "1px solid #e5e7eb",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  sidebarBrand: {
    marginBottom: "30px",
  },
  sidebarNav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  skeletonItem: {
    height: "40px",
    backgroundColor: "#f3f4f6",
    borderRadius: "6px",
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  },
  main: {
    flex: 1,
    padding: "30px",
  },
  topbar: {
    marginBottom: "30px",
  },
  topbarTitle: {
    marginBottom: "20px",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "20px",
    marginBottom: "30px",
  },
  cardSkeleton: {
    backgroundColor: "white",
    borderRadius: "8px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  skeletonBox: {
    height: "16px",
    backgroundColor: "#f3f4f6",
    borderRadius: "4px",
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  },
  skeletonText: {
    height: "12px",
    backgroundColor: "#f3f4f6",
    borderRadius: "4px",
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  },
  pagination: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
  },
};

const skeletonStyles = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;
