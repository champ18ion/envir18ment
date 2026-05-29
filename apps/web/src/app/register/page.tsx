"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deriveKey, decryptPrivateKey } from "@/lib/crypto";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");

      const { ciphertext, nonce, salt } = JSON.parse(data.user.encryptedPrivateKey);
      const masterKey = await deriveKey(password, salt);
      const privateKey = decryptPrivateKey(ciphertext, nonce, masterKey);

      localStorage.setItem("e18_token", data.token);
      localStorage.setItem("e18_userId", data.user.id);
      localStorage.setItem("e18_email", data.user.email);
      localStorage.setItem("e18_publicKey", data.user.publicKey);
      sessionStorage.setItem("e18_privateKey", privateKey);

      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite) {
        await fetch(`${API}/api/invites/${invite}/accept`, { method: "POST", headers: { Authorization: `Bearer ${data.token}` } });
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-280px", left: "50%", transform: "translateX(-50%)", width: "900px", height: "700px", background: "radial-gradient(ellipse, rgba(186,207,247,0.07) 0%, transparent 65%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0 }} />

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid rgba(186,215,247,0.06)", position: "relative", zIndex: 1 }}>
        <Link href="/" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#81899b", textDecoration: "none" }}>envir18ment</Link>
        <Link href="/login" style={{ fontSize: "13px", color: "#9da7ba", textDecoration: "none" }}>Sign in</Link>
      </nav>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", zIndex: 1 }}>
        <form onSubmit={submit} style={{ width: "100%", maxWidth: "380px" }}>
          <div style={{ background: "rgba(5,6,15,0.97)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "16px", padding: "32px", boxShadow: "rgba(216,236,248,0.2) 0px 1px 1px 0px inset, rgba(168,216,245,0.06) 0px 24px 48px 0px inset, rgba(0,0,0,0.3) 0px 16px 32px 0px" }}>
            <div style={{ marginBottom: "24px" }}>
              <p style={{ fontSize: "11px", color: "#81899b", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Create account</p>
              <h1 className="font-heading e18-gradient-text" style={{ fontSize: "22px", fontWeight: 400 }}>envir18ment</h1>
            </div>

            {error && (
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", color: "#ef4444" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9da7ba", marginBottom: "6px" }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" className="e18-input" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#9da7ba", marginBottom: "6px" }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" className="e18-input" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="e18-btn-primary">
              {loading ? "Creating account…" : "Continue"}
            </button>

            <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#81899b" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "#d1e4fa", textDecoration: "none" }}>Sign in</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
