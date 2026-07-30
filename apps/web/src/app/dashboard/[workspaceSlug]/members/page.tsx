"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Trash2, Shield, User, Copy, Check, Link2 } from "lucide-react";
import { decryptEnvKey, encryptEnvKey, encryptSecret, generateEnvKey } from "@/lib/crypto";
import { DashboardNav } from "@/components/DashboardNav";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040").replace(/\/+$/, "");

interface Member { id: string; email: string; publicKey: string; role: string; joinedAt: string; needsKeys: boolean }

export default function MembersPage() {
  const router = useRouter();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [workspaceId, setWorkspaceId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [inviteLink, setInviteLink] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [distributingId, setDistributingId] = useState<string | null>(null);
  const [distributeError, setDistributeError] = useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leavingWs, setLeavingWs] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("e18_token") : null;
  const myId = typeof window !== "undefined" ? localStorage.getItem("e18_userId") : null;
  const privateKey = typeof window !== "undefined" ? sessionStorage.getItem("e18_privateKey") : null;

  useEffect(() => {
    if (!token || !privateKey) { router.replace("/login"); return; }
    async function load() {
      try {
        const wsRes = await fetch(`${API}/api/workspaces/${workspaceSlug}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!wsRes.ok) { router.replace("/dashboard"); return; }
        const ws = await wsRes.json();
        setWorkspaceId(ws.id);
        setMyRole(ws.role);

        const mRes = await fetch(`${API}/api/members?workspaceId=${ws.id}`, { headers: { Authorization: `Bearer ${token}` } });
        const mList: Member[] = await mRes.json();
        setMembers(mList);
      } catch { setError("Failed to load members"); }
      finally { setLoading(false); }
    }
    load();
  }, [router, workspaceSlug, token, privateKey]);

  const isAdmin = myRole === "owner" || myRole === "admin";

  async function generateInvite() {
    setGeneratingLink(true);
    try {
      if (!privateKey) throw new Error("Sign in again to load your encryption key");

      const projectsResponse = await fetch(`${API}/api/projects?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!projectsResponse.ok) throw new Error("Could not load workspace projects");
      const projects = await projectsResponse.json() as { id: string }[];
      const environmentLists = await Promise.all(projects.map(async project => {
        const response = await fetch(`${API}/api/environments?projectId=${project.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load project environments");
        return response.json() as Promise<{ id: string }[]>;
      }));
      const environments = environmentLists.flat();
      const keys = await Promise.all(environments.map(async environment => {
        const response = await fetch(`${API}/api/secrets?environmentId=${environment.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not access every environment key");
        const { encryptedKey } = await response.json() as { encryptedKey: string };
        return {
          environmentId: environment.id,
          envKey: decryptEnvKey(encryptedKey, privateKey),
        };
      }));

      const shareKey = generateEnvKey();
      const { ciphertext, iv } = encryptSecret(JSON.stringify({
        version: 1,
        workspaceId,
        scope: "workspace",
        keys,
      }), shareKey);
      const res = await fetch(`${API}/api/v2/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId,
          scope: "workspace",
          role: "member",
          sealedPayload: ciphertext,
          payloadNonce: iv,
          expiresInHours: 24 * 7,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const urlSafeShareKey = shareKey
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      setInviteLink(`${data.inviteUrl}#${urlSafeShareKey}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to generate invite"); }
    finally { setGeneratingLink(false); }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function distributeKeys(member: Member) {
    setDistributingId(member.id);
    setDistributeError(null);
    try {
      const pRes = await fetch(`${API}/api/projects?workspaceId=${workspaceId}`, { headers: { Authorization: `Bearer ${token}` } });
      const projects: { id: string }[] = await pRes.json();

      const envLists = await Promise.all(
        projects.map(p => fetch(`${API}/api/environments?projectId=${p.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()))
      );
      const envs: { id: string }[] = envLists.flat();

      const encryptedKeys: { environmentId: string; encryptedKey: string }[] = [];
      const failed: string[] = [];
      for (const env of envs) {
        try {
          const skRes = await fetch(`${API}/api/secrets?environmentId=${env.id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!skRes.ok) { failed.push(env.id); continue; }
          const { encryptedKey } = await skRes.json();
          const rawEnvKey = decryptEnvKey(encryptedKey, privateKey!);
          encryptedKeys.push({ environmentId: env.id, encryptedKey: encryptEnvKey(rawEnvKey, member.publicKey) });
        } catch { failed.push(env.id); }
      }

      // Also distribute vault (workspace) key if available
      let vaultKey: string | undefined;
      try {
        const vkRes = await fetch(`${API}/api/vault/key?workspaceId=${workspaceId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (vkRes.ok) {
          const { encryptedKey } = await vkRes.json();
          const rawVaultKey = decryptEnvKey(encryptedKey, privateKey!);
          vaultKey = encryptEnvKey(rawVaultKey, member.publicKey);
        }
      } catch { /* vault key distribution is best-effort */ }

      await fetch(`${API}/api/members/${member.id}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, encryptedKeys, vaultKey }),
      });

      if (failed.length > 0) {
        setDistributeError(`Distributed ${encryptedKeys.length} keys. Could not access ${failed.length} environment(s).`);
      }
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, needsKeys: false } : m));
    } catch { setDistributeError("Failed to distribute keys"); }
    finally { setDistributingId(null); }
  }

  async function leaveWorkspace() {
    setLeavingWs(true);
    try {
      await fetch(`${API}/api/members/me?workspaceId=${workspaceId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      router.replace("/dashboard");
    } catch { setError("Failed to leave workspace"); }
    finally { setLeavingWs(false); }
  }

  async function changeRole(userId: string, role: string) {
    await fetch(`${API}/api/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId, role }),
    });
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role } : m));
  }

  async function removeMember(userId: string) {
    await fetch(`${API}/api/members/${userId}?workspaceId=${workspaceId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setMembers(prev => prev.filter(m => m.id !== userId));
    setRemoveConfirm(null);
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.05) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <DashboardNav breadcrumbs={[{ label: workspaceSlug, href: `/dashboard/${workspaceSlug}` }, { label: "Members" }]} />

      {/* Workspace tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(186,215,247,0.07)", padding: "0 28px", position: "relative", zIndex: 1 }}>
        {(["Projects", "Vault", "Members", "Activity"] as const).map(tab => {
          const href = tab === "Projects" ? `/dashboard/${workspaceSlug}` : `/dashboard/${workspaceSlug}/${tab.toLowerCase()}`;
          const active = tab === "Members";
          return (
            <Link key={tab} href={href} style={{ padding: "10px 16px", fontSize: "13px", color: active ? "#d8ecf8" : "#81899b", textDecoration: "none", borderBottom: active ? "2px solid #d1e4fa" : "2px solid transparent", marginBottom: "-1px", fontWeight: active ? 500 : 400 }}>
              {tab}
            </Link>
          );
        })}
      </div>

      <main style={{ padding: "32px", maxWidth: "760px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "20px", fontSize: "13px", color: "#ef4444" }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "18px", color: "#d8ecf8", fontWeight: 400 }}>
            Members <span style={{ fontSize: "13px", color: "#3f4959", fontWeight: 400 }}>{members.length}</span>
          </h1>
          {isAdmin && (
            <button onClick={generateInvite} disabled={generatingLink} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#663af3", border: "none", borderRadius: "6px", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
              <Link2 size={13} /> {generatingLink ? "Generating…" : "Invite link"}
            </button>
          )}
        </div>

        {/* Invite link card */}
        {inviteLink && (
          <div style={{ background: "rgba(102,58,243,0.06)", border: "1px solid rgba(102,58,243,0.25)", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "11px", color: "#9da7ba", marginBottom: "4px" }}>Share this link — expires in 7 days</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#d1e4fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteLink}</p>
            </div>
            <button onClick={copyLink} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "6px", color: copiedLink ? "#6ee7b7" : "#d1e4fa", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}>
              {copiedLink ? <Check size={13} /> : <Copy size={13} />}
              {copiedLink ? "Copied!" : "Copy"}
            </button>
            <button onClick={() => setInviteLink("")} style={{ padding: "7px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", fontSize: "16px", flexShrink: 0 }}>✕</button>
          </div>
        )}

        {distributeError && (
          <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", color: "#fbbf24" }}>{distributeError}</div>
        )}

        {/* Members list */}
        <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "40px 24px", color: "#81899b", fontSize: "13px" }}>Loading…</div>
          ) : members.map((m, i) => (
            <div key={m.id}>
              {i > 0 && <div style={{ height: "1px", background: "rgba(186,215,247,0.05)" }} />}

              {removeConfirm === m.id ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(239,68,68,0.04)" }}>
                  <span style={{ fontSize: "13px", color: "#9da7ba" }}>Remove <span style={{ color: "#d8ecf8" }}>{m.email}</span>?</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => removeMember(m.id)} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>Remove</button>
                    <button onClick={() => setRemoveConfirm(null)} style={{ padding: "5px 14px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(186,214,247,0.06)", border: "1px solid rgba(186,215,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={14} color="#81899b" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", color: "#d8ecf8", margin: 0 }}>{m.email}</p>
                    <p style={{ fontSize: "11px", color: "#3f4959", margin: 0 }}>Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
                  </div>

                  {/* Needs keys badge + distribute button */}
                  {m.needsKeys && isAdmin && m.id !== myId && (
                    <button
                      onClick={() => distributeKeys(m)}
                      disabled={distributingId === m.id}
                      style={{ padding: "5px 12px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "5px", color: "#fbbf24", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      {distributingId === m.id ? "Distributing…" : "Give access"}
                    </button>
                  )}
                  {m.needsKeys && !isAdmin && (
                    <span style={{ fontSize: "11px", color: "#fbbf24", padding: "3px 8px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: "4px" }}>Pending access</span>
                  )}

                  {isAdmin && m.id !== myId ? (
                    <select value={m.role} onChange={e => changeRole(m.id, e.target.value)} className="e18-input" style={{ padding: "5px 10px", fontSize: "12px", width: "auto" }}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: m.role === "owner" ? "#b6d9fc" : "#81899b", padding: "4px 10px", background: "rgba(186,214,247,0.04)", border: "1px solid rgba(186,215,247,0.08)", borderRadius: "5px" }}>
                      {m.role === "owner" && <Shield size={11} />}
                      {m.role}
                    </span>
                  )}

                  {isAdmin && m.id !== myId && (
                    <button onClick={() => setRemoveConfirm(m.id)} style={{ padding: "6px", background: "none", border: "none", color: "#3f4959", cursor: "pointer", display: "flex", alignItems: "center" }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {myRole && myRole !== "owner" && (
          <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid rgba(186,215,247,0.06)" }}>
            {leaveConfirm ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", color: "#9da7ba" }}>Leave this workspace?</span>
                <button onClick={leaveWorkspace} disabled={leavingWs} style={{ padding: "5px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}>
                  {leavingWs ? "Leaving…" : "Leave"}
                </button>
                <button onClick={() => setLeaveConfirm(false)} style={{ padding: "5px 10px", background: "none", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "5px", color: "#9da7ba", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setLeaveConfirm(true)} style={{ fontSize: "13px", color: "#6b7a96", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Leave workspace
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
