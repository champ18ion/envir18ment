"use client";
import { useEffect, useState, useCallback, DragEvent } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Eye, EyeOff, Copy, Check, Pencil, Trash2, Plus, Upload } from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";
import { decryptEnvKey, decryptSecret, encryptSecret } from "@/lib/crypto";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040";

interface Env { id: string; name: string; projectId: string }
interface Secret { id: string; key: string; encryptedValue: string; iv: string }
interface Row { id: string; key: string; value: string; revealed: boolean }
interface ImportPair { key: string; value: string }

function parseEnvFile(text: string): ImportPair[] {
  return text
    .split("\n").map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const eq = l.indexOf("="); const key = l.slice(0, eq).trim(); let val = l.slice(eq + 1).trim(); if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1); return { key, value: val }; })
    .filter(p => p.key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.key));
}

export default function ProjectPage() {
  const router = useRouter();
  const { workspaceSlug, projectSlug } = useParams<{ workspaceSlug: string; projectSlug: string }>();

  const [envs, setEnvs] = useState<Env[]>([]);
  const [activeEnv, setActiveEnv] = useState<Env | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [projectName, setProjectName] = useState(projectSlug);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Single add
  const [showAdd, setShowAdd] = useState(false);
  const [addKey, setAddKey] = useState("");
  const [addVal, setAddVal] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // Import
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ImportPair[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Deleted secrets
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedRows, setDeletedRows] = useState<Row[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  // New env
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("e18_token") : null;
  const privateKey = typeof window !== "undefined" ? sessionStorage.getItem("e18_privateKey") : null;

  const getEnvData = useCallback(async (envId: string) => {
    const res = await fetch(`${API}/api/secrets?environmentId=${envId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return { envKey: decryptEnvKey(data.encryptedKey, privateKey!), secrets: data.secrets as Secret[] };
  }, [token, privateKey]);

  const loadSecrets = useCallback(async (env: Env) => {
    if (!token || !privateKey) return;
    setLoadingSecrets(true); setRows([]); setError("");
    try {
      const { envKey, secrets } = await getEnvData(env.id);
      setRows(secrets.map(s => ({ id: s.id, key: s.key, value: decryptSecret(s.encryptedValue, s.iv, envKey), revealed: false })));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Decryption failed"); }
    finally { setLoadingSecrets(false); }
  }, [token, privateKey, getEnvData]);

  useEffect(() => {
    if (!token || !privateKey) { router.replace("/login"); return; }
    async function load() {
      try {
        const wsRes = await fetch(`${API}/api/workspaces/${workspaceSlug}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!wsRes.ok) { router.replace("/dashboard"); return; }
        const ws = await wsRes.json();
        const pRes = await fetch(`${API}/api/projects?workspaceId=${ws.id}`, { headers: { Authorization: `Bearer ${token}` } });
        const projects = await pRes.json();
        const project = projects.find((p: { slug: string; name: string }) => p.slug === projectSlug);
        if (!project) { router.replace(`/dashboard/${workspaceSlug}`); return; }
        setProjectName(project.name);
        const eRes = await fetch(`${API}/api/environments?projectId=${project.id}`, { headers: { Authorization: `Bearer ${token}` } });
        const list: Env[] = await eRes.json();
        const ordered = [...list].sort((a, b) => { const o = ["development", "staging", "production"]; return (o.indexOf(a.name) + 1 || 99) - (o.indexOf(b.name) + 1 || 99); });
        setEnvs(ordered);
        if (ordered.length > 0) {
          setActiveEnv(ordered[0]);
          void loadSecrets(ordered[0]);
        }
      } catch { setError("Failed to load"); }
    }
    load();
  }, [router, workspaceSlug, projectSlug, token, privateKey, loadSecrets]);

  async function doSave(envId: string, key: string, value: string) {
    const { envKey } = await getEnvData(envId);
    const { ciphertext, iv } = encryptSecret(value, envKey);
    const res = await fetch(`${API}/api/secrets`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ environmentId: envId, key, encryptedValue: ciphertext, iv }) });
    if (!res.ok) throw new Error("Save failed");
  }

  async function addSecret(e: React.SyntheticEvent) {
    e.preventDefault(); if (!activeEnv) return;
    setAdding(true);
    try { await doSave(activeEnv.id, addKey, addVal); setAddKey(""); setAddVal(""); setShowAdd(false); await loadSecrets(activeEnv); }
    catch { setError("Failed to save"); } finally { setAdding(false); }
  }

  async function saveEdit(row: Row) {
    if (!activeEnv) return;
    try { await doSave(activeEnv.id, row.key, editVal); setRows(r => r.map(s => s.id === row.id ? { ...s, value: editVal } : s)); setEditingId(null); }
    catch { setError("Failed to save"); }
  }

  async function deleteSecret(id: string) {
    await fetch(`${API}/api/secrets/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setRows(r => r.filter(s => s.id !== id)); setDeleteConfirm(null);
    // refresh deleted list if visible
    if (showDeleted && activeEnv) loadDeleted(activeEnv);
  }

  async function loadDeleted(env: Env) {
    setLoadingDeleted(true);
    try {
      const res = await fetch(`${API}/api/secrets?environmentId=${env.id}&deleted=true`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const envKey = decryptEnvKey(data.encryptedKey, privateKey!);
      setDeletedRows((data.secrets as Secret[]).map(s => ({ id: s.id, key: s.key, value: decryptSecret(s.encryptedValue, s.iv, envKey), revealed: false })));
    } catch { setDeletedRows([]); }
    finally { setLoadingDeleted(false); }
  }

  async function restoreSecret(id: string) {
    await fetch(`${API}/api/secrets/${id}/restore`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setDeletedRows(r => r.filter(s => s.id !== id));
    if (activeEnv) loadSecrets(activeEnv);
  }

  function toggleDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next && activeEnv) loadDeleted(activeEnv);
  }

  async function importSecrets() {
    if (!activeEnv || !parsed.length) return;
    setImporting(true);
    try { const { envKey } = await getEnvData(activeEnv.id); for (const { key, value } of parsed) { const { ciphertext, iv } = encryptSecret(value, envKey); await fetch(`${API}/api/secrets`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ environmentId: activeEnv.id, key, encryptedValue: ciphertext, iv }) }); } setPasteText(""); setParsed([]); setShowImport(false); await loadSecrets(activeEnv); }
    catch { setError("Import failed"); } finally { setImporting(false); }
  }

  async function createEnv(e: React.SyntheticEvent) {
    e.preventDefault(); if (!envs[0]) return;
    const res = await fetch(`${API}/api/environments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ projectId: envs[0].projectId, name: newEnvName }) });
    const data = await res.json(); if (!res.ok) return;
    setEnvs(prev => [...prev, data]); setNewEnvName(""); setShowNewEnv(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const text = ev.target?.result as string ?? ""; setPasteText(text); setParsed(parseEnvFile(text)); };
    reader.readAsText(file);
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  }

  async function copyAllAsEnv() {
    const text = rows.map(r => `${r.key}=${r.value}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied("__all__"); setTimeout(() => setCopied(null), 1500);
  }

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setRows(r => r.map(s => ({ ...s, revealed: next })));
  }

  const filtered = rows.filter(r => !search || r.key.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <DashboardNav
        breadcrumbs={[{ label: workspaceSlug, href: `/dashboard/${workspaceSlug}` }, { label: projectName }]}
        actions={<>
          <Link href={`/dashboard/${workspaceSlug}/members`} style={{ fontSize: "12px", color: "#6b7a96", textDecoration: "none" }}>Members</Link>
          <Link href={`/dashboard/${workspaceSlug}/activity`} style={{ fontSize: "12px", color: "#6b7a96", textDecoration: "none" }}>Activity</Link>
        </>}
      />

      <main style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto", position: "relative", zIndex: 1 }}>

        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>{error}</div>}

        {/* Env tabs + toolbar row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          {/* Env tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", borderBottom: "1px solid rgba(186,215,247,0.07)", paddingBottom: "0" }}>
            {envs.map(env => (
              <button key={env.id} onClick={() => { setActiveEnv(env); setSearch(""); setShowAll(false); setShowDeleted(false); setDeletedRows([]); void loadSecrets(env); }} style={{ padding: "8px 16px", fontSize: "13px", background: "none", border: "none", borderBottom: activeEnv?.id === env.id ? "2px solid #d1e4fa" : "2px solid transparent", color: activeEnv?.id === env.id ? "#d8ecf8" : "#81899b", cursor: "pointer", marginBottom: "-1px", fontWeight: activeEnv?.id === env.id ? 500 : 400, transition: "color 0.15s" }}>
                {env.name}
              </button>
            ))}
            {showNewEnv ? (
              <form onSubmit={createEnv} style={{ display: "flex", gap: "6px", marginLeft: "8px", alignItems: "center", paddingBottom: "4px" }}>
                <input autoFocus value={newEnvName} onChange={e => setNewEnvName(e.target.value)} placeholder="name" required className="e18-input" style={{ width: "100px", padding: "5px 10px", fontSize: "12px" }} />
                <button type="submit" style={{ padding: "5px 12px", background: "#663af3", color: "#fff", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
                <button type="button" onClick={() => setShowNewEnv(false)} style={{ padding: "5px 8px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "4px", color: "#81899b", cursor: "pointer", fontSize: "12px" }}>✕</button>
              </form>
            ) : (
              <button onClick={() => setShowNewEnv(true)} style={{ padding: "8px 10px", fontSize: "12px", background: "none", border: "none", color: "#3f4959", cursor: "pointer" }}>+ env</button>
            )}
          </div>
        </div>

        {/* Secrets header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <h2 style={{ fontSize: "13px", color: "#9da7ba", fontWeight: 500 }}>
              SECRETS <span style={{ color: "#3f4959", fontWeight: 400 }}>— Active ({filtered.length})</span>
            </h2>
            {rows.length > 0 && (
              <>
                <button onClick={toggleShowAll} style={{ fontSize: "12px", color: showAll ? "#b6d9fc" : "#81899b", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                  {showAll ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showAll ? "Hide all" : "Reveal all"}
                </button>
                <button onClick={copyAllAsEnv} style={{ fontSize: "12px", color: copied === "__all__" ? "#b6d9fc" : "#81899b", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                  {copied === "__all__" ? <Check size={12} /> : <Copy size={12} />}
                  {copied === "__all__" ? "Copied!" : "Copy as .env"}
                </button>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search secrets…" className="e18-input" style={{ width: "200px", padding: "7px 12px", fontSize: "12px" }} />
            </div>
            <button onClick={() => { setShowImport(v => !v); setShowAdd(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", fontSize: "12px", color: "#d1e4fa", cursor: "pointer" }}>
              <Upload size={13} /> Import .env
            </button>
            <button onClick={() => { setShowAdd(v => !v); setShowImport(false); }} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", background: "#663af3", border: "none", borderRadius: "6px", fontSize: "12px", color: "#fff", cursor: "pointer" }}>
              <Plus size={13} /> Add Secret
            </button>
          </div>
        </div>

        {/* Import panel */}
        {showImport && (
          <div style={{ background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.1)", borderRadius: "10px", padding: "20px", marginBottom: "12px" }}>
            <p style={{ fontSize: "12px", color: "#9da7ba", marginBottom: "10px" }}>Paste your <code style={{ fontFamily: "var(--font-mono)", color: "#d1e4fa" }}>.env</code> content or drop the file below</p>
            <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} style={{ position: "relative" }}>
              <textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setParsed(parseEnvFile(e.target.value)); }} placeholder={"DATABASE_URL=postgresql://...\nAPI_KEY=sk-...\nNODE_ENV=production"} rows={5} className="e18-input" style={{ fontFamily: "var(--font-mono)", fontSize: "12px", resize: "vertical", lineHeight: "1.7", borderColor: dragging ? "rgba(186,215,247,0.4)" : "rgba(186,215,247,0.12)" }} />
              {dragging && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,6,15,0.8)", borderRadius: "4px" }}><span style={{ fontSize: "14px", color: "#d1e4fa" }}>Drop .env file</span></div>}
            </div>
            {parsed.length > 0 && (
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
                {parsed.slice(0, 4).map(p => (
                  <div key={p.key} style={{ display: "flex", gap: "12px", padding: "5px 10px", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.07)", borderRadius: "4px", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#d8ecf8", minWidth: "200px" }}>{p.key}</span>
                    {rows.some(r => r.key === p.key) && <span style={{ fontSize: "10px", color: "#fbbf24", padding: "1px 6px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "3px", flexShrink: 0 }}>update</span>}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#81899b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.value || <em style={{ color: "#3f4959" }}>empty</em>}</span>
                  </div>
                ))}
                {parsed.length > 4 && <p style={{ fontSize: "11px", color: "#3f4959", padding: "2px 10px" }}>+{parsed.length - 4} more</p>}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
              <span style={{ fontSize: "12px", color: parsed.length > 0 ? "#9da7ba" : "#3f4959" }}>{parsed.length > 0 ? `${parsed.length} variable${parsed.length !== 1 ? "s" : ""} detected` : "Paste above to preview"}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { setShowImport(false); setPasteText(""); setParsed([]); }} style={{ padding: "7px 14px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", cursor: "pointer", fontSize: "12px" }}>Cancel</button>
                <button onClick={importSecrets} disabled={!parsed.length || importing} className="e18-btn-primary" style={{ width: "auto", padding: "7px 16px", fontSize: "12px" }}>
                  {importing ? "Importing…" : `Import ${parsed.length} secret${parsed.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add single row */}
        {showAdd && (
          <div style={{ background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.1)", borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
            <form onSubmit={addSecret} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: "0" }}>
              <div style={{ borderRight: "1px solid rgba(186,215,247,0.07)", padding: "12px 16px" }}>
                <input autoFocus value={addKey} onChange={e => setAddKey(e.target.value.toUpperCase())} placeholder="KEY_NAME" required className="e18-input" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", padding: "7px 10px" }} />
                {addKey && rows.some(r => r.key === addKey) && (
                  <p style={{ fontSize: "11px", color: "#fbbf24", marginTop: "4px" }}>Already exists — will overwrite</p>
                )}
              </div>
              <div style={{ padding: "12px 16px" }}>
                <input value={addVal} onChange={e => setAddVal(e.target.value)} placeholder="value" required className="e18-input" style={{ fontSize: "13px", padding: "7px 10px" }} />
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "12px 12px 12px 0" }}>
                <button type="submit" disabled={adding} className="e18-btn-primary" style={{ width: "auto", padding: "7px 18px", fontSize: "13px" }}>{adding ? "…" : "Save"}</button>
                <button type="button" onClick={() => { setShowAdd(false); setAddKey(""); setAddVal(""); }} style={{ padding: "7px 12px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Secrets list */}
        <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", overflow: "visible" }}>
          {loadingSecrets ? (
            <div style={{ padding: "40px 24px", color: "#81899b", fontSize: "13px" }}>Decrypting…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <p style={{ color: "#81899b", fontSize: "14px", marginBottom: "10px" }}>{search ? "No secrets match your search" : "No secrets in this environment"}</p>
              {!search && <button onClick={() => setShowAdd(true)} style={{ fontSize: "13px", color: "#d1e4fa", background: "none", border: "none", cursor: "pointer" }}>Add your first secret →</button>}
            </div>
          ) : (
            filtered.map((row, i) => (
              <div key={row.id}>
                {i > 0 && <div style={{ height: "1px", background: "rgba(186,215,247,0.05)", margin: "0" }} />}

                {deleteConfirm === row.id ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(239,68,68,0.04)" }}>
                    <span style={{ fontSize: "13px", color: "#9da7ba" }}>Delete <code style={{ fontFamily: "var(--font-mono)", color: "#d8ecf8" }}>{row.key}</code>?</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => deleteSecret(row.id)} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Delete</button>
                      <button onClick={() => setDeleteConfirm(null)} style={{ padding: "5px 14px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : editingId === row.id ? (
                  <div style={{ display: "grid", gridTemplateColumns: "38% 1fr auto", alignItems: "center" }}>
                    <div style={{ padding: "10px 20px", borderRight: "1px solid rgba(186,215,247,0.07)", display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ color: "#3f4959", fontSize: "14px", userSelect: "none" }}>≡</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#d8ecf8", fontWeight: 500 }}>{row.key}</span>
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} className="e18-input" style={{ fontSize: "13px", padding: "7px 10px" }} />
                    </div>
                    <div style={{ display: "flex", gap: "8px", padding: "10px 16px", alignItems: "center" }}>
                      <button onClick={() => saveEdit(row)} style={{ padding: "6px 14px", background: "#663af3", border: "none", borderRadius: "5px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: "6px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "38% 1fr auto", alignItems: "center", minHeight: "52px" }}>
                    {/* Key pane */}
                    <div style={{ padding: "0 20px", borderRight: "1px solid rgba(186,215,247,0.07)", display: "flex", alignItems: "center", gap: "12px", height: "52px" }}>
                      <span style={{ color: "#3f4959", fontSize: "16px", userSelect: "none", cursor: "grab" }}>≡</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#d8ecf8", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.key}</span>
                    </div>

                    {/* Value pane */}
                    <div style={{ padding: "0 20px", display: "flex", alignItems: "center", gap: "10px", height: "52px", borderRight: "1px solid rgba(186,215,247,0.07)" }}>
                      <span style={{ fontSize: "11px", color: "#3f4959" }}>●</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: row.revealed ? "#9da7ba" : "#3f4959", letterSpacing: row.revealed ? "normal" : "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "400px" }}>
                        {row.revealed ? row.value : "●●●●●●●●●●●●●●●●"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: "4px", height: "52px" }}>
                      <button onClick={() => setRows(r => r.map(s => s.id === row.id ? { ...s, revealed: !s.revealed } : s))} title={row.revealed ? "Hide" : "Reveal"} style={{ padding: "6px", background: "none", border: "none", color: row.revealed ? "#b6d9fc" : "#81899b", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center" }}>
                        {row.revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button onClick={() => copy(row.id, row.value)} title="Copy" style={{ padding: "6px", background: "none", border: "none", color: copied === row.id ? "#b6d9fc" : "#81899b", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center" }}>
                        {copied === row.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      {/* ··· menu */}
                      <button type="button" onClick={() => { setEditingId(row.id); setEditVal(row.value); }} title="Edit variable" aria-label={`Edit ${row.key}`} style={{ width: "30px", height: "30px", padding: 0, background: "none", border: "none", color: "#81899b", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(row.id)} title="Delete variable" aria-label={`Delete ${row.key}`} style={{ width: "30px", height: "30px", padding: 0, background: "none", border: "none", color: "#ef4444", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Deleted secrets */}
        <div style={{ marginTop: "20px" }}>
          <button onClick={toggleDeleted} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#4a5568", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <span style={{ fontSize: "10px", transform: showDeleted ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
            Deleted secrets {deletedRows.length > 0 && !loadingDeleted && `(${deletedRows.length})`}
          </button>
          {showDeleted && (
            <div style={{ marginTop: "8px", background: "rgba(239,68,68,0.02)", border: "1px solid rgba(239,68,68,0.08)", borderRadius: "10px", overflow: "hidden" }}>
              {loadingDeleted ? (
                <div style={{ padding: "24px 20px", fontSize: "13px", color: "#4a5568" }}>Loading…</div>
              ) : deletedRows.length === 0 ? (
                <div style={{ padding: "24px 20px", fontSize: "13px", color: "#4a5568" }}>No deleted secrets</div>
              ) : deletedRows.map((row, i) => (
                <div key={row.id}>
                  {i > 0 && <div style={{ height: "1px", background: "rgba(239,68,68,0.06)" }} />}
                  <div style={{ display: "grid", gridTemplateColumns: "38% 1fr auto", alignItems: "center", minHeight: "48px", opacity: 0.6 }}>
                    <div style={{ padding: "0 20px", borderRight: "1px solid rgba(239,68,68,0.08)", display: "flex", alignItems: "center", gap: "12px", height: "48px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#6b7a96", textDecoration: "line-through" }}>{row.key}</span>
                    </div>
                    <div style={{ padding: "0 20px", height: "48px", display: "flex", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#3f4959", letterSpacing: "1px" }}>●●●●●●●●</span>
                    </div>
                    <div style={{ padding: "0 16px", display: "flex", alignItems: "center" }}>
                      <button onClick={() => restoreSecret(row.id)} style={{ padding: "5px 12px", background: "rgba(186,214,247,0.04)", border: "1px solid rgba(186,215,247,0.1)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CLI hint */}
        {activeEnv && rows.length > 0 && (
          <p style={{ marginTop: "16px", fontSize: "12px", color: "#3f4959", fontFamily: "var(--font-mono)" }}>
            e18 link @{workspaceSlug}/{projectSlug}/{activeEnv.name}
            <span style={{ color: "#81899b" }}> · </span>
            e18 run -- node server.js
          </p>
        )}
      </main>
    </div>
  );
}
