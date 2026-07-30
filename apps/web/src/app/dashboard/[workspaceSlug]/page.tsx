"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";
import { apiFetch } from "@/lib/api";

interface Workspace { id: string; name: string; slug: string; role: string }
interface Project { id: string; name: string; slug: string; workspaceId: string }

export default function WorkspacePage() {
  const router = useRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");

  // Workspace rename/delete
  const [renamingWs, setRenamingWs] = useState(false);
  const [renameWsName, setRenameWsName] = useState("");
  const [deleteWsConfirm, setDeleteWsConfirm] = useState(false);
  const [wsLoading, setWsLoading] = useState(false);

  // Project rename/delete
  const [renamingProject, setRenamingProject] = useState<string | null>(null);
  const [renameProjectName, setRenameProjectName] = useState("");
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("e18_token");
    if (!token) { router.replace("/login?reason=session"); return; }

    async function load() {
      try {
        const wsRes = await apiFetch(`/api/workspaces/${workspaceSlug}`);
        if (!wsRes.ok) { router.replace("/dashboard"); return; }
        const ws: Workspace = await wsRes.json();
        setWorkspace(ws);

        const pRes = await apiFetch(`/api/projects?workspaceId=${ws.id}`);
        const pData = await pRes.json();
        setProjects(Array.isArray(pData) ? pData : []);
      } catch {
        setError("Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, workspaceSlug]);

  const isAdmin = workspace?.role === "owner" || workspace?.role === "admin";
  const isOwner = workspace?.role === "owner";

  async function createProject(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!workspace) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: newName, workspaceId: workspace.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setProjects(prev => [...prev, data]);
      setNewName(""); setShowNew(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function doRenameWorkspace(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!workspace) return;
    setWsLoading(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameWsName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setWorkspace(prev => prev ? { ...prev, name: data.name, slug: data.slug } : prev);
      setRenamingWs(false);
      if (data.slug !== workspaceSlug) router.replace(`/dashboard/${data.slug}`);
    } finally {
      setWsLoading(false);
    }
  }

  async function doDeleteWorkspace() {
    if (!workspace) return;
    setWsLoading(true);
    await apiFetch(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
    router.replace("/dashboard");
  }

  async function doRenameProject(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!renamingProject) return;
    const res = await apiFetch(`/api/projects/${renamingProject}`, {
      method: "PATCH",
      body: JSON.stringify({ name: renameProjectName }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    setProjects(prev => prev.map(p => p.id === renamingProject ? { ...p, name: data.name, slug: data.slug } : p));
    setRenamingProject(null);
  }

  async function doDeleteProject(id: string) {
    await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeleteProjectConfirm(null);
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "1000px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <DashboardNav breadcrumbs={[{ label: workspace?.name ?? workspaceSlug }]} />

      {/* Workspace tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(186,215,247,0.07)", padding: "0 28px", position: "relative", zIndex: 1 }}>
        {(["Projects", "Vault", "Members", "Activity"] as const).map(tab => {
          const href = tab === "Projects" ? `/dashboard/${workspaceSlug}` : `/dashboard/${workspaceSlug}/${tab.toLowerCase()}`;
          const active = tab === "Projects";
          return (
            <Link key={tab} href={href} style={{ padding: "10px 16px", fontSize: "13px", color: active ? "#d8ecf8" : "#81899b", textDecoration: "none", borderBottom: active ? "2px solid #d1e4fa" : "2px solid transparent", marginBottom: "-1px", fontWeight: active ? 500 : 400 }}>
              {tab}
            </Link>
          );
        })}
      </div>

      <main style={{ flex: 1, padding: "40px 32px", maxWidth: "900px", width: "100%", margin: "0 auto", position: "relative", zIndex: 1 }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#81899b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {workspace?.role ?? "workspace"}
            </p>

            {renamingWs ? (
              <form onSubmit={doRenameWorkspace} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input autoFocus value={renameWsName} onChange={e => setRenameWsName(e.target.value)} required className="e18-input" style={{ fontSize: "18px", padding: "6px 10px" }} />
                <button type="submit" disabled={wsLoading} style={{ padding: "6px 14px", background: "#663af3", border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px", cursor: "pointer" }}>{wsLoading ? "…" : "Save"}</button>
                <button type="button" onClick={() => setRenamingWs(false)} style={{ padding: "6px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", fontSize: "13px", cursor: "pointer" }}>✕</button>
              </form>
            ) : deleteWsConfirm ? (
              <div>
                <h1 className="font-heading e18-gradient-text" style={{ fontSize: "28px", fontWeight: 500, marginBottom: "12px" }}>{workspace?.name}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "13px", color: "#9da7ba" }}>Delete workspace and all its data?</span>
                  <button onClick={doDeleteWorkspace} disabled={wsLoading} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Delete</button>
                  <button onClick={() => setDeleteWsConfirm(false)} style={{ padding: "5px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h1 className="font-heading e18-gradient-text" style={{ fontSize: "28px", fontWeight: 500 }}>
                  {loading ? "…" : workspace?.name}
                </h1>
                {isAdmin && !loading && (
                  <div style={{ display: "flex", gap: "2px" }}>
                    <button onClick={() => { setRenamingWs(true); setRenameWsName(workspace?.name ?? ""); }} title="Rename workspace" style={{ padding: "5px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}><Pencil size={14} /></button>
                    {isOwner && <button onClick={() => setDeleteWsConfirm(true)} title="Delete workspace" style={{ padding: "5px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}><Trash2 size={14} /></button>}
                  </div>
                )}
              </div>
            )}
          </div>

          {isAdmin && (
            <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "999px", fontSize: "13px", color: "#d1e4fa", cursor: "pointer" }}>
              New project
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>{error}</div>
        )}

        {showNew && isAdmin && (
          <form onSubmit={createProject} style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name" required className="e18-input" style={{ flex: 1 }} />
            <button type="submit" disabled={creating} className="e18-btn-primary" style={{ width: "auto", padding: "0 20px" }}>{creating ? "Creating…" : "Create"}</button>
            <button type="button" onClick={() => setShowNew(false)} style={{ padding: "0 16px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
          </form>
        )}

        {loading ? (
          <div style={{ color: "#81899b", fontSize: "14px" }}>Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", border: "1px dashed rgba(186,215,247,0.1)", borderRadius: "12px" }}>
            <p style={{ color: "#81899b", fontSize: "14px", marginBottom: isAdmin ? "12px" : 0 }}>
              {isAdmin ? "No projects yet" : "You do not have access to any projects yet"}
            </p>
            {isAdmin && (
              <button onClick={() => setShowNew(true)} style={{ fontSize: "13px", color: "#d1e4fa", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Create your first project</button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            {projects.map(p => (
              <div key={p.id} style={{ padding: "20px 24px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "12px", boxShadow: "rgba(199,211,234,0.12) 0px 1px 1px 0px inset, rgba(199,211,234,0.05) 0px 24px 48px 0px inset, rgba(6,6,14,0.7) 0px 24px 32px 0px", minHeight: "90px" }}>

                {renamingProject === p.id ? (
                  <form onSubmit={doRenameProject} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input autoFocus value={renameProjectName} onChange={e => setRenameProjectName(e.target.value)} required className="e18-input" style={{ fontSize: "13px", padding: "7px 10px" }} />
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button type="submit" style={{ padding: "5px 12px", background: "#663af3", border: "none", borderRadius: "5px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>Save</button>
                      <button type="button" onClick={() => setRenamingProject(null)} style={{ padding: "5px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>✕</button>
                    </div>
                  </form>
                ) : deleteProjectConfirm === p.id ? (
                  <div>
                    <p style={{ fontSize: "13px", color: "#9da7ba", marginBottom: "10px" }}>Delete <span style={{ color: "#d8ecf8" }}>{p.name}</span> and all its secrets?</p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => doDeleteProject(p.id)} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Delete</button>
                      <button onClick={() => setDeleteProjectConfirm(null)} style={{ padding: "5px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                      <Link href={`/dashboard/${workspaceSlug}/${p.slug}`} style={{ textDecoration: "none", flex: 1 }}>
                        <p style={{ fontSize: "15px", color: "#ffffff", fontWeight: 500 }}>{p.name}</p>
                      </Link>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: "2px", marginLeft: "8px", flexShrink: 0 }}>
                          <button onClick={() => { setRenamingProject(p.id); setRenameProjectName(p.name); }} title="Rename" style={{ padding: "4px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}><Pencil size={12} /></button>
                          <button onClick={() => setDeleteProjectConfirm(p.id)} title="Delete" style={{ padding: "4px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    <Link href={`/dashboard/${workspaceSlug}/${p.slug}`} style={{ textDecoration: "none" }}>
                      <p style={{ fontSize: "11px", color: "#81899b" }}>Manage secrets →</p>
                    </Link>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
