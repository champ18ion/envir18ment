"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, ChevronDown } from "lucide-react";

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface DashboardNavProps {
  breadcrumbs: Breadcrumb[];
  actions?: React.ReactNode;
}

export function DashboardNav({ breadcrumbs, actions }: DashboardNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmail(localStorage.getItem("e18_email") ?? "");
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function signOut() {
    localStorage.removeItem("e18_token");
    localStorage.removeItem("e18_userId");
    localStorage.removeItem("e18_publicKey");
    localStorage.removeItem("e18_email");
    sessionStorage.removeItem("e18_privateKey");
    router.push("/login");
  }

  const initial = email ? email[0].toUpperCase() : "·";

  return (
    <nav style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "0 28px", height: "48px", flexShrink: 0,
      borderBottom: "1px solid rgba(186,215,247,0.06)",
      position: "relative", zIndex: 10,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#4a5568", textDecoration: "none", letterSpacing: "0.02em", marginRight: "2px" }}>
        e18
      </Link>

      {/* Breadcrumbs */}
      {breadcrumbs.map((crumb, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "#2a3040", fontSize: "14px", lineHeight: 1 }}>/</span>
          {crumb.href ? (
            <Link href={crumb.href} style={{ fontSize: "13px", color: "#6b7a96", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#9da7ba")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6b7a96")}
            >{crumb.label}</Link>
          ) : (
            <span style={{ fontSize: "13px", color: "#d1e4fa", fontWeight: 500 }}>{crumb.label}</span>
          )}
        </span>
      ))}

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginRight: "8px" }}>
            {actions}
          </div>
        )}

        {/* Avatar dropdown */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 8px 4px 4px",
              background: open ? "rgba(186,214,247,0.08)" : "transparent",
              border: "1px solid",
              borderColor: open ? "rgba(186,215,247,0.15)" : "transparent",
              borderRadius: "8px", cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              if (!open) {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(186,214,247,0.05)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(186,215,247,0.1)";
              }
            }}
            onMouseLeave={e => {
              if (!open) {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
              }
            }}
          >
            <div style={{
              width: "26px", height: "26px", borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(102,58,243,0.4) 0%, rgba(186,214,247,0.15) 100%)",
              border: "1px solid rgba(186,215,247,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, color: "#d1e4fa",
            }}>
              {initial}
            </div>
            <ChevronDown size={11} color="#4a5568" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>

          {open && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)",
              background: "#07091a", border: "1px solid rgba(186,215,247,0.1)",
              borderRadius: "10px", padding: "6px", minWidth: "200px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.6), 0 1px 0 rgba(186,215,247,0.04) inset",
            }}>
              {/* Email header */}
              <div style={{ padding: "8px 10px 10px", marginBottom: "2px", borderBottom: "1px solid rgba(186,215,247,0.06)" }}>
                <p style={{ fontSize: "11px", color: "#4a5568", margin: "0 0 2px" }}>Signed in as</p>
                <p style={{ fontSize: "12px", color: "#9da7ba", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email || "—"}</p>
              </div>

              <div style={{ padding: "4px 0" }}>
                <Link
                  href="/dashboard/profile"
                  onClick={() => setOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", color: "#9da7ba", fontSize: "13px", textDecoration: "none", borderRadius: "6px" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(186,214,247,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <User size={13} /> Profile
                </Link>
                <button
                  onClick={signOut}
                  style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 10px", background: "none", border: "none", color: "#ef4444", fontSize: "13px", cursor: "pointer", borderRadius: "6px", textAlign: "left" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.06)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
