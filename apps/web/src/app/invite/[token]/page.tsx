"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { decryptSecret, encryptEnvKey } from "@/lib/crypto";
import { apiFetch } from "@/lib/api";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040").replace(/\/+$/, "");

interface Invite {
  workspaceName: string;
  workspaceSlug: string;
  scope: string;
  role: string;
  sealedPayload: string;
  payloadNonce: string;
}

interface SealedPayload {
  version: number;
  keys: { environmentId: string; envKey: string }[];
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [fragment, setFragment] = useState("");
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const acceptStarted = useRef(false);
  const isLoggedIn = typeof window !== "undefined" && !!localStorage.getItem("e18_token");

  useEffect(() => {
    const fragmentTimer = window.setTimeout(() => setFragment(window.location.hash), 0);
    fetch(`${API}/api/v2/invites/${token}`)
      .then(response => response.ok
        ? response.json()
        : response.json().then((data: { error: string }) => { throw new Error(data.error); }))
      .then(setInvite)
      .catch((cause: Error) => setError(cause.message));
    return () => window.clearTimeout(fragmentTimer);
  }, [token]);

  async function accept() {
    if (!invite || acceptStarted.current) return;
    acceptStarted.current = true;
    setAccepting(true);
    setError("");

    try {
      const shareKey = decodeURIComponent(fragment.slice(1));
      if (!shareKey) throw new Error("This invite is missing its decryption key");

      const payload = JSON.parse(
        decryptSecret(invite.sealedPayload, invite.payloadNonce, shareKey),
      ) as SealedPayload;
      if (payload.version !== 1 || !Array.isArray(payload.keys)) throw new Error("Unsupported invitation");

      const publicKey = localStorage.getItem("e18_publicKey");
      if (!publicKey) throw new Error("Sign in again to load your encryption key");
      const encryptedKeys = payload.keys.map(key => ({
        environmentId: key.environmentId,
        encryptedKey: encryptEnvKey(key.envKey, publicKey),
      }));

      const response = await apiFetch(`/api/v2/invites/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ encryptedKeys }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not accept invitation");
      router.push(`/dashboard/${invite.workspaceSlug}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not accept invitation");
      setAccepting(false);
    }
      acceptStarted.current = false;
  }

  useEffect(() => {
    if (invite && fragment && isLoggedIn) {
      void accept();
    }
  }, [invite, fragment, isLoggedIn]);

  const returnTo = encodeURIComponent(`/invite/${token}${fragment}`);

  return (
    <div style={{ background: "#05060f", minHeight: "100vh", display: "flex", flexDirection: "column", color: "#d8ecf8" }}>
      <nav style={{ padding: "16px 32px", borderBottom: "1px solid rgba(186,215,247,0.06)" }}>
        <Link href="/" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#81899b", textDecoration: "none" }}>envir18ment</Link>
      </nav>

      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: "400px", background: "rgba(5,6,15,0.97)", border: "1px solid rgba(186,215,247,0.12)", borderRadius: "16px", padding: "32px" }}>
          {error && <p style={{ padding: "10px 12px", color: "#ef4444", background: "rgba(239,68,68,0.08)", borderRadius: "6px", marginBottom: "18px", fontSize: "13px" }}>{error}</p>}

          {!invite ? (
            <p style={{ color: "#81899b", fontSize: "13px" }}>{error ? "Invitation unavailable" : "Validating sealed invitation…"}</p>
          ) : (
            <>
              <p style={{ fontSize: "11px", color: "#81899b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Sealed invitation to</p>
              <h1 className="font-heading e18-gradient-text" style={{ fontSize: "24px", fontWeight: 400, marginBottom: "10px" }}>{invite.workspaceName}</h1>
              <p style={{ color: "#81899b", fontSize: "13px", marginBottom: "24px" }}>{invite.scope} access · {invite.role}</p>

              {isLoggedIn ? (
                <button onClick={accept} disabled={accepting || !fragment} className="e18-btn-primary">
                  {accepting ? "Granting access and opening workspace…" : "Accept sealed invite"}
                </button>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  <Link href={`/register?returnTo=${returnTo}`} className="e18-btn-primary" style={{ textAlign: "center", textDecoration: "none" }}>Create account</Link>
                  <Link href={`/login?returnTo=${returnTo}`} style={{ textAlign: "center", textDecoration: "none", padding: "11px", borderRadius: "6px", border: "1px solid rgba(186,215,247,0.12)", color: "#d1e4fa", fontSize: "14px" }}>Sign in instead</Link>
                </div>
              )}

                <p style={{ color: "#3f4959", fontSize: "11px", lineHeight: 1.5, marginTop: "18px" }}>
                  Keys are unsealed in this browser and re-encrypted for your account. The server never receives the link&apos;s decryption key.
                </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
