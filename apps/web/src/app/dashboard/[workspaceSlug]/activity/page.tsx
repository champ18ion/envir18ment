"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { DashboardNav } from "@/components/DashboardNav";
import { apiFetch } from "@/lib/api";

interface LogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  userEmail: string;
}

function actionLabel(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    "secret.created": { label: "Created secret", color: "#6ee7b7" },
    "secret.updated": { label: "Updated secret", color: "#93c5fd" },
    "secret.deleted": { label: "Deleted secret", color: "#fca5a5" },
    "secret.restored": { label: "Restored secret", color: "#6ee7b7" },
    "member.added":   { label: "Added member",   color: "#6ee7b7" },
    "member.removed": { label: "Removed member", color: "#fca5a5" },
  };
  return map[action] ?? { label: action, color: "#81899b" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ActivityPage() {
  const router = useRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("e18_token") : null;

  useEffect(() => {
    if (!token) { router.replace("/login?reason=session"); return; }
    async function load() {
      try {
        const wsRes = await apiFetch(`/api/workspaces/${workspaceSlug}`);
        if (!wsRes.ok) { router.replace("/dashboard"); return; }
        const ws = await wsRes.json();

        const res = await apiFetch(`/api/activity?workspaceId=${ws.id}`);
        if (!res.ok) throw new Error("Failed");
        setLogs(await res.json());
      } catch { setError("Failed to load activity"); }
      finally { setLoading(false); }
    }
    load();
  }, [router, workspaceSlug, token]);

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <DashboardNav breadcrumbs={[{ label: workspaceSlug, href: `/dashboard/${workspaceSlug}` }, { label: "Activity" }]} />

      {/* Workspace tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(186,215,247,0.07)", padding: "0 28px", position: "relative", zIndex: 1 }}>
        {(["Projects", "Vault", "Members", "Activity"] as const).map(tab => {
          const href = tab === "Projects" ? `/dashboard/${workspaceSlug}` : `/dashboard/${workspaceSlug}/${tab.toLowerCase()}`;
          const active = tab === "Activity";
          return (
            <Link key={tab} href={href} style={{ padding: "10px 16px", fontSize: "13px", color: active ? "#d8ecf8" : "#81899b", textDecoration: "none", borderBottom: active ? "2px solid #d1e4fa" : "2px solid transparent", marginBottom: "-1px", fontWeight: active ? 500 : 400 }}>
              {tab}
            </Link>
          );
        })}
      </div>

      <main style={{ padding: "32px", maxWidth: "760px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>{error}</div>}

        <h1 style={{ fontSize: "18px", color: "#d8ecf8", fontWeight: 400, marginBottom: "24px" }}>Activity</h1>

        <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "40px 24px", color: "#81899b", fontSize: "13px" }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <p style={{ color: "#81899b", fontSize: "14px" }}>No activity yet</p>
            </div>
          ) : logs.map((log, i) => {
            const { label, color } = actionLabel(log.action);
            return (
              <div key={log.id}>
                {i > 0 && <div style={{ height: "1px", background: "rgba(186,215,247,0.05)" }} />}
                <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", gap: "14px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", color: "#d8ecf8", margin: 0 }}>
                      <span style={{ color: "#9da7ba" }}>{log.userEmail}</span>
                      {" "}
                      <span style={{ color }}>{label}</span>
                      {log.resourceType === "secret" && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#6b7a96", marginLeft: "8px" }}>
                          {log.resourceId}
                        </span>
                      )}
                    </p>
                    {log.resourceType !== "secret" && (
                      <p style={{ fontSize: "11px", color: "#3f4959", margin: 0, fontFamily: "var(--font-mono)" }}>
                        {log.resourceType}/{log.resourceId}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "#3f4959", flexShrink: 0 }}>{timeAgo(log.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: "16px", fontSize: "12px", color: "#3f4959" }}>Last 100 events</p>
      </main>
    </div>
  );
}
