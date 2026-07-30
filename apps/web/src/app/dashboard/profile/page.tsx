"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, LogOut } from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040").replace(/\/+$/, "");

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [userId, setUserId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("e18_token");
    if (!token) { router.replace("/login"); return; }
    setEmail(localStorage.getItem("e18_email") ?? "");
    setPublicKey(localStorage.getItem("e18_publicKey") ?? "");
    setUserId(localStorage.getItem("e18_userId") ?? "");
  }, [router]);

  async function copyKey() {
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function signOut() {
    ["e18_token","e18_userId","e18_publicKey","e18_email"].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem("e18_privateKey");
    router.push("/login");
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "fixed", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.04) 0%, transparent 65%)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />
      <DashboardNav breadcrumbs={[{ label: "Profile" }]} />

      <main style={{ flex: 1, padding: "48px 32px", maxWidth: "560px", margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
        <h1 style={{ fontSize: "20px", color: "#d8ecf8", fontWeight: 400, marginBottom: "32px" }}>Profile</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Email */}
          <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", padding: "20px 24px" }}>
            <p style={{ fontSize: "11px", color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Email</p>
            <p style={{ fontSize: "14px", color: "#d1e4fa", margin: 0 }}>{email || "—"}</p>
          </div>

          {/* User ID */}
          <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", padding: "20px 24px" }}>
            <p style={{ fontSize: "11px", color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>User ID</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#6b7a96", margin: 0 }}>{userId || "—"}</p>
          </div>

          {/* Public key */}
          <div style={{ background: "rgba(186,214,247,0.02)", border: "1px solid rgba(186,215,247,0.09)", borderRadius: "10px", padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <p style={{ fontSize: "11px", color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Public Key</p>
              <button onClick={copyKey} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "rgba(186,214,247,0.04)", border: "1px solid rgba(186,215,247,0.1)", borderRadius: "5px", color: copied ? "#6ee7b7" : "#6b7a96", fontSize: "11px", cursor: "pointer" }}>
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#4a5568", margin: 0, wordBreak: "break-all", lineHeight: 1.6 }}>{publicKey || "—"}</p>
          </div>

          {/* E2E note */}
          <p style={{ fontSize: "12px", color: "#2a3040", padding: "0 4px", lineHeight: 1.6 }}>
            Your private key never leaves this device. It is derived from your password and stored only in session memory.
          </p>

          {/* Sign out */}
          <button onClick={signOut} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "10px", color: "#ef4444", fontSize: "13px", cursor: "pointer", marginTop: "8px" }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
