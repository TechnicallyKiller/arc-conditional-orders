import { KeeperStatus } from "./KeeperStatus";

const navLink: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
  whiteSpace: "nowrap", color: "var(--ink-2)", textDecoration: "none",
};

export function Header() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
      <div
        style={{
          pointerEvents: "auto", width: "100%", maxWidth: 1160, display: "flex", flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "8px 8px 8px 16px", border: "1px solid var(--hair)", borderRadius: 28,
          background: "rgba(24,21,17,.55)", backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)", boxShadow: "0 1px 2px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: "var(--vermilion)" }} />
          <span className="serif" style={{ fontSize: 22, lineHeight: "28px", letterSpacing: "-0.011em", color: "var(--ink)" }}>Arc</span>
          <span className="label">Conditional Orders</span>
        </div>
        <nav style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          <a href="#how" style={navLink}>How it works</a>
          <a href="#honest" style={navLink}>What can go wrong</a>
          <a href="#proof" style={navLink}>Proof</a>
          <a href="/docs" style={navLink}>Docs</a>
          <a href="/status" style={navLink}>Status</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <KeeperStatus />
          <a
            href="/app"
            style={{
              height: 36, display: "inline-flex", alignItems: "center", padding: "0 18px",
              borderRadius: 999, background: "var(--ink)", color: "var(--paper)",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}
          >
            Open the app
          </a>
        </div>
      </div>
    </header>
  );
}
