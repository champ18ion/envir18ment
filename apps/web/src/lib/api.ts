const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4040";

function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("e18_token");
  localStorage.removeItem("e18_userId");
  localStorage.removeItem("e18_email");
  localStorage.removeItem("e18_publicKey");
  sessionStorage.removeItem("e18_privateKey");
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("e18_token") : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    clearAuth();
    window.location.replace("/login?reason=expired");
    return new Promise(() => {});
  }
  return res;
}
