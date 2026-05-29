"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/DashboardNav";
import { apiFetch } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("e18_token");
    if (!token) { router.replace("/login?reason=session"); return; }
    apiFetch("/api/workspaces")
      .then(r => r.json())
      .then(data => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load workspaces"))
      .finally(() => setLoading(false));
  }, [router]);

  async function createWorkspace(e: React.SyntheticEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setWorkspaces(prev => [...prev, { ...data, role: "owner" }]);
      setNewName("");
      setShowNew(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "1000px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />
      <DashboardNav breadcrumbs={[]} />

      <main style={{ flex: 1, padding: "48px 32px", maxWidth: "900px", width: "100%", margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#81899b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dashboard</p>
            <h1 className="font-heading e18-gradient-text" style={{ fontSize: "28px", fontWeight: 500 }}>Workspaces</h1>
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: "8px 16px", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "999px", fontSize: "13px", color: "#d1e4fa", cursor: "pointer" }}
          >
            New workspace
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>
            {error}
          </div>
        )}

        {/* New workspace form */}
        {showNew && (
          <form onSubmit={createWorkspace} style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Workspace name"
              required
              className="e18-input"
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={creating} className="e18-btn-primary" style={{ width: "auto", padding: "0 20px" }}>
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowNew(false)} style={{ padding: "0 16px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", cursor: "pointer", fontSize: "13px" }}>
              Cancel
            </button>
          </form>
        )}

        {/* Workspace grid */}
        {loading ? (
          <div style={{ color: "#81899b", fontSize: "14px" }}>Loading…</div>
        ) : workspaces.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", border: "1px dashed rgba(186,215,247,0.1)", borderRadius: "12px" }}>
            <p style={{ color: "#81899b", fontSize: "14px", marginBottom: "12px" }}>No workspaces yet</p>
            <button onClick={() => setShowNew(true)} style={{ fontSize: "13px", color: "#d1e4fa", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Create your first workspace
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            {workspaces.map(ws => (
              <Link key={ws.id} href={`/dashboard/${ws.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ padding: "20px 24px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "12px", boxShadow: "rgba(199,211,234,0.12) 0px 1px 1px 0px inset, rgba(199,211,234,0.05) 0px 24px 48px 0px inset, rgba(6,6,14,0.7) 0px 24px 32px 0px", cursor: "pointer", transition: "border-color 0.15s" }}>
                  <p style={{ fontSize: "15px", color: "#ffffff", fontWeight: 500, marginBottom: "6px" }}>{ws.name}</p>
                  <p style={{ fontSize: "11px", color: "#81899b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{ws.role}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
