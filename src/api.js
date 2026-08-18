/* =========================================================================
   api.js — cliente HTTP hacia el backend (server/).
   Reemplaza por completo a storage.js / window.storage.
   ========================================================================= */

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const ADMIN_TOKEN_KEY = "cocolab_admin_token";

function getAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* noop */
  }
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let resp;
  try {
    resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("No se pudo conectar con el servidor.", 0, null);
  }

  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }

  if (!resp.ok) {
    if (resp.status === 401 && auth) setAdminToken("");
    throw new ApiError(
      (data && data.error) || "Error en la solicitud",
      resp.status,
      data
    );
  }
  return data;
}

export const api = {
  ApiError,

  /* ---------- público ---------- */
  getConfig: () => request("/config"),
  getCandidates: () => request("/candidates"),
  getResults: () => request("/results"),

  lookupVoter: (cedula) => request("/voter/lookup", { method: "POST", body: { cedula } }),
  requestOtp: (cedula) => request("/otp/request", { method: "POST", body: { cedula } }),
  verifyOtp: (cedula, code) =>
    request("/otp/verify", { method: "POST", body: { cedula, code } }),
  castVote: (voteToken, candidateId) =>
    request("/vote", { method: "POST", body: { voteToken, candidateId } }),

  /* ---------- admin ---------- */
  adminLogin: async (username, password) => {
    const data = await request("/admin/login", {
      method: "POST",
      body: { username, password },
    });
    setAdminToken(data.token);
    return data;
  },
  adminLogout: () => setAdminToken(""),
  isAdminLoggedIn: () => !!getAdminToken(),

  getAdminZones: () => request("/admin/zones", { auth: true }),
  getAdminCandidates: () => request("/admin/candidates", { auth: true }),
  addCandidate: (zona, nombre, foto) =>
    request("/admin/candidates", { method: "POST", auth: true, body: { zona, nombre, foto } }),
  deleteCandidate: (id) =>
    request(`/admin/candidates/${encodeURIComponent(id)}`, { method: "DELETE", auth: true }),

  getAdminVoters: () => request("/admin/voters", { auth: true }),
  addVoter: (cedula, nombre, movil, zona) =>
    request("/admin/voters", { method: "POST", auth: true, body: { cedula, nombre, movil, zona } }),
  deleteVoter: (cedula) =>
    request(`/admin/voters/${encodeURIComponent(cedula)}`, { method: "DELETE", auth: true }),
  importVoters: (rows) =>
    request("/admin/voters/import", { method: "POST", auth: true, body: { rows } }),

  getReport: () => request("/admin/report", { auth: true }),
};

export { ApiError };
