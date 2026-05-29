"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<{ workspaceName: string; workspaceSlug: string } | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  const isLoggedIn = typeof window !== "undefined" && !!localStorage.getItem("e18_token");

  useEffect(() => {
    fetch(`${API}/api/invites/${token}`)
      .then(r => r.ok ? r.json() : r.json().then((d: { error: string }) => { throw new Error(d.error) }))
      .then(setWorkspace)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function accept() {
    setAccepting(true);
    try {
      const t = localStorage.getItem("e18_token")!;
      const res = await fetch(`${API}/api/invites/${token}/accept`, { method: "POST", headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/dashboard/${data.workspaceSlug}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setAccepting(false);
    }
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.07) 0%, transparent 65%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0 }} />

      <nav style={{ display: "flex", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid rgba(186,215,247,0.06)", position: "relative", zIndex: 1 }}>
        <Link href="/" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#81899b", textDecoration: "none" }}>envir18ment</Link>
      </nav>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: "380px", background: "rgba(5,6,15,0.97)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "16px", padding: "32px", boxShadow: "rgba(216,236,248,0.2) 0px 1px 1px 0px inset, rgba(0,0,0,0.3) 0px 16px 32px 0px" }}>
          {error ? (
            <>
              <p style={{ fontSize: "11px", color: "#81899b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Invalid invite</p>
              <p style={{ fontSize: "14px", color: "#ef4444" }}>{error}</p>
            </>
          ) : !workspace ? (
            <p style={{ fontSize: "13px", color: "#81899b" }}>Validating invite…</p>
          ) : (
            <>
              <p style={{ fontSize: "11px", color: "#81899b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>You&apos;ve been invited to</p>
              <h1 className="font-heading e18-gradient-text" style={{ fontSize: "22px", fontWeight: 400, marginBottom: "24px" }}>{workspace.workspaceName}</h1>

              {isLoggedIn ? (
                <button onClick={accept} disabled={accepting} className="e18-btn-primary">
                  {accepting ? "Joining…" : "Accept invite"}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <Link href={`/register?invite=${token}`} className="e18-btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none", padding: "11px", borderRadius: "6px", background: "#663af3", color: "#fff", fontSize: "14px" }}>
                    Create account
                  </Link>
                  <Link href={`/login?invite=${token}`} style={{ display: "block", textAlign: "center", textDecoration: "none", padding: "11px", borderRadius: "6px", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", color: "#d1e4fa", fontSize: "14px" }}>
                    Sign in instead
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
