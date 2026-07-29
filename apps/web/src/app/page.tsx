import Link from "next/link";

const features = ["E2E encrypted", "CLI tool", "Team workspaces", "Zero-knowledge", "Open source"];

export default function Home() {
  return (
    <div style={{ background: "#05060f", minHeight: "100vh", color: "#d8ecf8", position: "relative", overflow: "hidden" }}>

      {/* Atmospheric glow */}
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "1000px", height: "800px", background: "radial-gradient(ellipse, rgba(186,207,247,0.07) 0%, transparent 65%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0 }} />

      {/* Floating pill nav */}
      <div style={{ position: "fixed", top: "20px", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
        <nav style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "6px 6px 6px 14px",
          background: "rgba(12,14,28,0.85)",
          border: "1px solid rgba(186,215,247,0.1)",
          borderRadius: "999px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(186,215,247,0.04) inset",
          pointerEvents: "all",
        }}>
          {/* Logo mark */}
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(186,214,247,0.08)", border: "1px solid rgba(186,215,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: "6px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#9da7ba", letterSpacing: "-0.02em" }}>e18</span>
          </div>

          <Link href="/login" style={{ fontSize: "13px", color: "#81899b", textDecoration: "none", padding: "6px 12px", borderRadius: "999px" }}>Sign in</Link>

          <Link href="/register" style={{
            fontSize: "13px", color: "#fff", textDecoration: "none",
            padding: "7px 16px", borderRadius: "999px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}>
            Get started
          </Link>
        </nav>
      </div>

      {/* Hero */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "72px 24px 56px", position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 10px", background: "#05060f", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#81899b", fontSize: "11px" }}>
          Open source · E2E encrypted
        </div>

        <h1 className="font-heading font-normal e18-gradient-text" style={{ fontSize: "clamp(52px,8vw,80px)", lineHeight: "1.1", letterSpacing: 0, marginBottom: "16px" }}>
          envir18ment
        </h1>

        <p style={{ fontSize: "15px", color: "#9da7ba", lineHeight: "1.6", maxWidth: "380px", marginBottom: "48px" }}>
          Secure environment secrets for teams.<br />Zero-knowledge encryption — we never see your secrets.
        </p>

        {/* Product mockup card */}
        <div style={{ width: "100%", maxWidth: "520px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "16px", padding: "20px 24px", boxShadow: "rgba(199,211,234,0.12) 0px 1px 1px 0px inset, rgba(199,211,234,0.05) 0px 24px 48px 0px inset, rgba(6,6,14,0.7) 0px 24px 32px 0px", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "rgba(186,215,247,0.1)" }} />
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "rgba(186,215,247,0.1)" }} />
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "rgba(186,215,247,0.1)" }} />
          </div>
          <div style={{ textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: "1.8" }}>
            <div style={{ color: "#3f4959" }}>$ e18 link @myapp/production</div>
            <div style={{ color: "#9da7ba" }}>✓ Linked to myapp / production</div>
            <div style={{ height: "8px" }} />
            <div style={{ color: "#3f4959" }}>$ e18 run -- node server.js</div>
            <div style={{ color: "#9da7ba" }}>✓ Injected 12 secrets · starting server…</div>
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {features.map(f => (
            <span key={f} style={{ padding: "4px 10px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.08)", borderRadius: "6px", fontSize: "11px", color: "#81899b" }}>{f}</span>
          ))}
        </div>
      </section>

      {/* CTA section */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px 96px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontSize: "11px", color: "#3f4959", marginBottom: "12px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Start building today</p>
        <h2 className="font-heading font-normal e18-gradient-text" style={{ fontSize: "clamp(28px,5vw,44px)", lineHeight: "1.16", marginBottom: "40px" }}>
          Your secrets, secured.
        </h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/register" style={{ textDecoration: "none" }}>
            <div style={{ padding: "20px 24px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "12px", boxShadow: "rgba(199,211,234,0.12) 0px 1px 1px 0px inset, rgba(199,211,234,0.05) 0px 24px 48px 0px inset, rgba(6,6,14,0.7) 0px 24px 32px 0px", minWidth: "200px", textAlign: "left", cursor: "pointer" }}>
              <p style={{ fontSize: "14px", color: "#ffffff", marginBottom: "4px", fontWeight: 500 }}>Use web dashboard</p>
              <p style={{ fontSize: "12px", color: "#81899b" }}>Manage secrets in your browser</p>
            </div>
          </Link>
          <a href="https://github.com/champ18ion/envir18ment" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <div style={{ padding: "20px 24px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "12px", boxShadow: "rgba(199,211,234,0.12) 0px 1px 1px 0px inset, rgba(199,211,234,0.05) 0px 24px 48px 0px inset, rgba(6,6,14,0.7) 0px 24px 32px 0px", minWidth: "200px", textAlign: "left", cursor: "pointer" }}>
              <p style={{ fontSize: "14px", color: "#ffffff", marginBottom: "4px", fontWeight: 500 }}>View code on GitHub</p>
              <p style={{ fontSize: "12px", color: "#81899b" }}>Star us · MIT license</p>
            </div>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(186,215,247,0.06)", padding: "20px 32px", display: "flex", justifyContent: "center" }}>
        <p style={{ fontSize: "12px", color: "#3f4959" }}>envir18ment · open source · MIT</p>
      </footer>

    </div>
  );
}
