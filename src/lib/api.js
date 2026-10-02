const BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(message, { code, status, offline } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.offline = Boolean(offline);
  }
}

async function request(path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the GreenCompile backend. Start it with: cd backend && uvicorn main:app --reload --port 8000",
      { offline: true },
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((d) => d.msg).join("; ")
      : data?.detail;
    throw new ApiError(data?.error?.message || detail || `Request failed (HTTP ${res.status}).`, {
      code: data?.error?.code,
      status: res.status,
    });
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  environment: () => request("/environment"),
  compile: (b) => request("/compile", b),
  analyze: (b) => request("/analyze", b),
  recommend: (b) => request("/recommend", b),
  optimize: (b) => request("/optimize", b),
  explain: (b) => request("/explain", b),
};
