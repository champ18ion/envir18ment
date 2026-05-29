"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Eye, EyeOff, Copy, Check, Trash2, Plus, X } from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";
import { apiFetch } from "@/lib/api";
import { decryptEnvKey, decryptSecret, encryptSecret } from "@/lib/crypto";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040";

const TYPES = [
  { value: "ssh-key",         label: "SSH Key" },
  { value: "pem",             label: "Certificate / PEM" },
  { value: "service-account", label: "Service Account JSON" },
  { value: "api-key",         label: "API Key" },
  { value: "password",        label: "Password" },
  { value: "note",            label: "Secure Note" },
  { value: "other",           label: "Other" },
];

interface VaultItem {
  id: string; name: string; type: string; encryptedValue: string; iv: string; note: string | null; createdAt: string;
}
interface DecryptedItem extends VaultItem { value: string; revealed: boolean }

function typeLabel(t: string) { return TYPES.find(x => x.value === t)?.label ?? t; }

function typeBadgeColor(t: string): string {
  const map: Record<string, string> = {
    "ssh-key": "#6ee7b7", "pem": "#93c5fd", "service-account": "#c4b5fd",
    "api-key": "#fcd34d", "password": "#fca5a5", "note": "#9da7ba", "other": "#6b7a96",
  };
  return map[t] ?? "#6b7a96";
}

export default function VaultPage() {
  const router = useRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [workspaceId, setWorkspaceId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [wsKey, setWsKey] = useState<string | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("ssh-key");
  const [addValue, setAddValue] = useState("");
  const [addNote, setAddNote] = useState("");
  const [adding, setAdding] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("e18_token") : null;
  const privateKey = typeof window !== "undefined" ? sessionStorage.getItem("e18_privateKey") : null;

  const loadItems = useCallback(async (wid: string, key: string) => {
    const res = await apiFetch(`/api/vault?workspaceId=${wid}`);
    if (!res.ok) return;
    const raw: VaultItem[] = await res.json();
    setItems(raw.map(item => {
      try {
        const value = decryptSecret(item.encryptedValue, item.iv, key);
        return { ...item, value, revealed: false };
      } catch { return { ...item, value: "[decryption failed]", revealed: false }; }
    }));
  }, []);

  useEffect(() => {
    if (!token || !privateKey) { router.replace("/login?reason=session"); return; }
    async function load() {
      try {
        const wsRes = await apiFetch(`/api/workspaces/${workspaceSlug}`);
        if (!wsRes.ok) { router.replace("/dashboard"); return; }
        const ws = await wsRes.json();
        setWorkspaceId(ws.id);
        setMyRole(ws.role);

        const keyRes = await fetch(`${API}/api/vault/key?workspaceId=${ws.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!keyRes.ok) {
          const body = await keyRes.json();
          setBootstrapped(!!body.bootstrapped);
          setNoAccess(true);
          setLoading(false);
          return;
        }
        const { encryptedKey } = await keyRes.json();
        const key = decryptEnvKey(encryptedKey, privateKey!);
        setWsKey(key);
        await loadItems(ws.id, key);
      } catch { setError("Failed to load vault"); }
      finally { setLoading(false); }
    }
    load();
  }, [router, workspaceSlug, token, privateKey, loadItems]);

  async function bootstrap() {
    setBootstrapping(true);
    try {
      const res = await apiFetch("/api/vault/bootstrap", { method: "POST", body: JSON.stringify({ workspaceId }) });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
      const { encryptedKey } = await res.json();
      const key = decryptEnvKey(encryptedKey, privateKey!);
      setWsKey(key); setNoAccess(false);
      await loadItems(workspaceId, key);
    } catch { setError("Failed to initialize vault"); }
    finally { setBootstrapping(false); }
  }

  async function addItem(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!wsKey || !workspaceId) return;
    setAdding(true);
    try {
      const { ciphertext, iv } = encryptSecret(addValue, wsKey);
      const res = await apiFetch("/api/vault", {
        method: "POST",
        body: JSON.stringify({ workspaceId, name: addName, type: addType, encryptedValue: ciphertext, iv, note: addNote || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      const value = decryptSecret(data.encryptedValue, data.iv, wsKey);
      setItems(prev => [...prev, { ...data, value, revealed: false }]);
      setAddName(""); setAddType("ssh-key"); setAddValue(""); setAddNote(""); setShowAdd(false);
    } catch { setError("Failed to add"); }
    finally { setAdding(false); }
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/vault/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteConfirm(null);
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  }

  function toggle(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, revealed: !i.revealed } : i));
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <DashboardNav breadcrumbs={[{ label: workspaceSlug, href: `/dashboard/${workspaceSlug}` }, { label: "Vault" }]} />

      {/* Workspace tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(186,215,247,0.07)", padding: "0 28px", position: "relative", zIndex: 1 }}>
        {(["Projects", "Vault", "Members", "Activity"] as const).map(tab => {
          const href = tab === "Projects" ? `/dashboard/${workspaceSlug}` : `/dashboard/${workspaceSlug}/${tab.toLowerCase()}`;
          const active = tab === "Vault";
          return (
            <Link key={tab} href={href} style={{ padding: "10px 16px", fontSize: "13px", color: active ? "#d8ecf8" : "#81899b", textDecoration: "none", borderBottom: active ? "2px solid #d1e4fa" : "2px solid transparent", marginBottom: "-1px", fontWeight: active ? 500 : 400 }}>
              {tab}
            </Link>
          );
        })}
      </div>

      <main style={{ flex: 1, padding: "40px 32px", maxWidth: "860px", width: "100%", margin: "0 auto", position: "relative", zIndex: 1 }}>

        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>{error}</div>}

        {noAccess ? (
          <div style={{ padding: "56px 24px", textAlign: "center", border: "1px dashed rgba(186,215,247,0.08)", borderRadius: "12px" }}>
            {!bootstrapped && (myRole === "owner" || myRole === "admin") ? (
              <>
                <p style={{ color: "#d8ecf8", fontSize: "14px", marginBottom: "8px" }}>Vault not initialized yet</p>
                <p style={{ color: "#81899b", fontSize: "13px", marginBottom: "20px" }}>This will generate an encryption key and distribute it to all current members.</p>
                <button onClick={bootstrap} disabled={bootstrapping} style={{ padding: "9px 22px", background: "#663af3", border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
                  {bootstrapping ? "Initializing…" : "Initialize vault"}
                </button>
              </>
            ) : (
              <>
                <p style={{ color: "#fbbf24", fontSize: "14px", marginBottom: "8px" }}>Vault access pending</p>
                <p style={{ color: "#81899b", fontSize: "13px" }}>An admin needs to click "Give access" on the Members page to distribute your vault key.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <h1 style={{ fontSize: "18px", color: "#d8ecf8", fontWeight: 400, margin: 0 }}>Vault</h1>
                <p style={{ fontSize: "12px", color: "#3f4959", margin: "4px 0 0" }}>E2E encrypted — store SSH keys, certs, service accounts and more</p>
              </div>
              <button onClick={() => setShowAdd(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#663af3", border: "none", borderRadius: "6px", fontSize: "13px", color: "#fff", cursor: "pointer" }}>
                {showAdd ? <X size={13} /> : <Plus size={13} />} {showAdd ? "Cancel" : "Add secret"}
              </button>
            </div>

            {/* Add form */}
            {showAdd && (
              <form onSubmit={addItem} style={{ background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.1)", borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "#9da7ba", marginBottom: "6px" }}>Name</label>
                    <input autoFocus value={addName} onChange={e => setAddName(e.target.value)} placeholder="Production SSH Key" required className="e18-input" style={{ fontSize: "13px" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "#9da7ba", marginBottom: "6px" }}>Type</label>
                    <select value={addType} onChange={e => setAddType(e.target.value)} className="e18-input" style={{ fontSize: "13px" }}>
                      {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#9da7ba", marginBottom: "6px" }}>Value</label>
                  <textarea value={addValue} onChange={e => setAddValue(e.target.value)} placeholder={addType === "pem" ? "-----BEGIN RSA PRIVATE KEY-----\n..." : addType === "service-account" ? '{\n  "type": "service_account",\n  ...\n}' : "Paste the secret content here"} required rows={6} className="e18-input" style={{ fontFamily: "var(--font-mono)", fontSize: "12px", resize: "vertical", lineHeight: "1.6" }} />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#9da7ba", marginBottom: "6px" }}>Note <span style={{ color: "#3f4959" }}>(optional)</span></label>
                  <input value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="Where this is used, rotation date, etc." className="e18-input" style={{ fontSize: "13px" }} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" disabled={adding} className="e18-btn-primary" style={{ width: "auto", padding: "0 20px" }}>{adding ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={() => setShowAdd(false)} style={{ padding: "0 16px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: "#9da7ba", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
                </div>
              </form>
            )}

            {/* Items list */}
            {loading ? (
              <div style={{ color: "#81899b", fontSize: "13px" }}>Decrypting…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "56px 24px", textAlign: "center", border: "1px dashed rgba(186,215,247,0.08)", borderRadius: "12px" }}>
                <p style={{ color: "#81899b", fontSize: "14px", marginBottom: "10px" }}>Nothing stored yet</p>
                <button onClick={() => setShowAdd(true)} style={{ fontSize: "13px", color: "#d1e4fa", background: "none", border: "none", cursor: "pointer" }}>Add your first secret →</button>
              </div>
            ) : (
              <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", overflow: "hidden" }}>
                {items.map((item, i) => (
                  <div key={item.id}>
                    {i > 0 && <div style={{ height: "1px", background: "rgba(186,215,247,0.05)" }} />}
                    {deleteConfirm === item.id ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(239,68,68,0.04)" }}>
                        <span style={{ fontSize: "13px", color: "#9da7ba" }}>Delete <span style={{ color: "#d8ecf8" }}>{item.name}</span>?</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => deleteItem(item.id)} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Delete</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ padding: "5px 14px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: item.revealed ? "12px" : "0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: `${typeBadgeColor(item.type)}18`, border: `1px solid ${typeBadgeColor(item.type)}30`, color: typeBadgeColor(item.type), fontWeight: 500 }}>
                              {typeLabel(item.type)}
                            </span>
                            <span style={{ fontSize: "14px", color: "#d8ecf8", fontWeight: 500 }}>{item.name}</span>
                            {item.note && <span style={{ fontSize: "11px", color: "#3f4959" }}>{item.note}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <button onClick={() => toggle(item.id)} title={item.revealed ? "Hide" : "Reveal"} style={{ padding: "6px", background: "none", border: "none", color: item.revealed ? "#b6d9fc" : "#81899b", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}>
                              {item.revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button onClick={() => copy(item.id, item.value)} title="Copy" style={{ padding: "6px", background: "none", border: "none", color: copied === item.id ? "#b6d9fc" : "#81899b", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}>
                              {copied === item.id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button onClick={() => setDeleteConfirm(item.id)} title="Delete" style={{ padding: "6px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center", borderRadius: "4px" }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {item.revealed && (
                          <pre style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#9da7ba", background: "rgba(186,214,247,0.03)", border: "1px solid rgba(186,215,247,0.07)", borderRadius: "6px", padding: "12px 14px", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: "1.6", maxHeight: "300px", overflowY: "auto" }}>
                            {item.value}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
