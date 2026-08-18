import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api.js";
import { parseVotersCsv, downloadVotersCsvTemplate } from "./csv.js";
import { exportReportToExcel, exportReportToPdf } from "./reportExport.js";

/* =========================================================================
   VOTACIÓN COCOLAB — ElectroHuila
   ========================================================================= */

const LOGO_SRC = "/images/LOGO-normal.png";

const COLORS = {
  blue: "#1C9AD6",
  blueDark: "#0B3B5C",
  navy: "#082436",
  orange: "#F2801F",
  green: "#8DC63F",
  bg: "#F5F9FC",
  card: "#FFFFFF",
  ink: "#0B2A3D",
  inkSoft: "#4C6B7D",
  line: "#DCE8EF",
  danger: "#E24C4C",
};

const DEFAULT_ZONES = ["Zona Neiva", "Zona Norte", "Zona Sur", "Zona Occidente"];

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Bolt({ size = 18, color = COLORS.orange }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill={color} />
    </svg>
  );
}

function Medidor({ segments, size = 220 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = size / 2 - 18;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c} cy={c} r={r} stroke={COLORS.line} strokeWidth={16} fill="none" />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const len = frac * circumference;
          const dasharray = `${len} ${circumference - len}`;
          const dashoffset = -offsetAcc;
          offsetAcc += len;
          return (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              stroke={s.color}
              strokeWidth={16}
              fill="none"
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: Math.max(13, size * 0.16), fontWeight: 700, color: COLORS.ink }}>
          {Math.round(total)}
        </div>
        <div style={{ fontSize: Math.max(8, size * 0.06), color: COLORS.inkSoft, letterSpacing: 1, textTransform: "uppercase" }}>
          votos
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
function VotacionCocolab() {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [config, setConfig] = useState({ zones: DEFAULT_ZONES });
  const [candidates, setCandidates] = useState({});
  const [tab, setTab] = useState("votar");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const loadPublicState = useCallback(async () => {
    try {
      const [cfg, cd] = await Promise.all([api.getConfig(), api.getCandidates()]);
      setConfig(cfg);
      setCandidates(cd);
      setOffline(false);
      const adminStatus = api.isAdminLoggedIn();
      setIsAdmin(adminStatus);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadPublicState();
      setReady(true);
    })();
  }, [loadPublicState]);

  const handleAdminLogin = () => {
    setIsAdmin(true);
    setShowAdminLogin(false);
    setTab("admin");
  };

  if (!ready) {
    return (
      <div style={{ ...styles.page, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <div style={{ color: COLORS.inkSoft, fontFamily: "'Inter', sans-serif" }}>Cargando plataforma…</div>
      </div>
    );
  }

  if (offline) {
    return (
      <div style={{ ...styles.page, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <GlobalFonts />
        <Card>
          <CardTitle icon={<Bolt color={COLORS.danger} />}>No pudimos conectar con el servidor</CardTitle>
          <p style={styles_p}>
            Verifica que el backend esté corriendo (ver README) e inténtalo de nuevo.
          </p>
          <PrimaryButton onClick={loadPublicState}>Reintentar</PrimaryButton>
        </Card>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <GlobalFonts />
      <Header 
        tab={tab} 
        setTab={setTab} 
        isAdmin={isAdmin}
        onAdminLoginClick={() => setShowAdminLogin(true)}
      />
      <main style={styles.main}>
        {tab === "votar" && (
          <VotarFlow candidates={candidates} refreshAll={loadPublicState} />
        )}
        {/* SOLO ADMIN PUEDE VER RESULTADOS */}
        {tab === "resultados" && isAdmin && <Resultados config={config} />}
        {tab === "admin" && (
          isAdmin ? (
            <Admin config={config} onLogout={() => setIsAdmin(false)} />
          ) : (
            <AdminLogin 
              onLoginSuccess={handleAdminLogin}
              onCancel={() => setTab("votar")}
            />
          )
        )}
        {/* Si no es admin e intenta ver resultados, mostrar mensaje */}
        {tab === "resultados" && !isAdmin && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={{ ...styles_p, color: COLORS.danger }}>
              ⚠️ Acceso restringido. Solo los administradores pueden ver los resultados.
            </p>
            <PrimaryButton onClick={() => setTab("votar")}>Volver a Votar</PrimaryButton>
          </div>
        )}
      </main>
      <Footer />
      
      {showAdminLogin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,36,54,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setShowAdminLogin(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: COLORS.card,
              borderRadius: 20,
              padding: 32,
              maxWidth: 400,
              width: "100%",
            }}
          >
            <AdminLogin 
              onLoginSuccess={() => {
                setIsAdmin(true);
                setShowAdminLogin(false);
                setTab("admin");
              }}
              onCancel={() => setShowAdminLogin(false)}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE DE LOGIN
// ============================================================
function AdminLogin({ onLoginSuccess, onCancel, compact }) {
  const [username, setUsername] = useState("admin");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e) {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.adminLogin(username.trim(), pass);
      setPass("");
      onLoginSuccess();
    } catch (error) {
      setErr(error.message || "Usuario o contraseña incorrectos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <CardTitle icon={<Bolt />}>
        {compact ? "Acceso Admin" : "Acceso administrador"}
      </CardTitle>
      {!compact && (
        <p style={styles_p}>
          Ingresa con tu usuario y contraseña de administrador para gestionar la plataforma.
        </p>
      )}
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario"
          style={styles_input}
          autoFocus
        />
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Contraseña"
          style={styles_input}
        />
        {err && <ErrorText>{err}</ErrorText>}
        <div style={{ display: "flex", gap: 10 }}>
          <PrimaryButton type="submit" disabled={busy} full>
            {busy ? "Ingresando…" : "Ingresar"}
          </PrimaryButton>
          {onCancel && (
            <SecondaryButton type="button" onClick={onCancel} full>
              Cancelar
            </SecondaryButton>
          )}
        </div>
        {!compact && (
          <div style={{ 
            marginTop: 10, 
            padding: 10, 
            background: `${COLORS.blue}10`, 
            borderRadius: 8,
            fontSize: 12,
            color: COLORS.inkSoft,
            textAlign: "center"
          }}>
            <strong>Credenciales por defecto:</strong><br />
            Usuario: <code>admin</code> · Contraseña: <code>admin123</code>
          </div>
        )}
      </form>
    </div>
  );
}

// ============================================================
// GLOBAL FONTS
// ============================================================
function GlobalFonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
      * { box-sizing: border-box; }
      button { font-family: inherit; cursor: pointer; }
      input { font-family: inherit; }
      ::selection { background: ${COLORS.orange}33; }
      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; animation: none !important; }
      }
      input[type="file"] {
        display: block;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        font-size: 12.5px;
      }
      .file-input-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      .file-input-row > * { max-width: 100%; }
      @media (max-width: 640px) {
        .app-header-inner { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }
        .app-nav { width: 100%; }
        .app-nav-btn { flex: 1; min-width: 0; padding: 8px 4px !important; font-size: 12px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .result-row { flex-wrap: wrap; }
        .result-stat { min-width: 100% !important; order: 3; display: flex !important; align-items: baseline; gap: 8px; text-align: left !important; padding-left: 64px; margin-top: -2px; }
        .result-stat .pct-big { font-size: 17px !important; }
        .leader-badge { display: block !important; margin-left: 0 !important; margin-top: 4px; width: fit-content; }
        .card { padding: 18px !important; }
        .admin-section-tabs { flex-wrap: nowrap !important; }
        .admin-tab-btn {
          flex: 1 1 0;
          min-width: 0 !important;
          padding: 8px 6px !important;
          font-size: 12px !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
        }
        .stat-row .stat-badge { flex: 1 1 calc(50% - 6px); min-width: 0 !important; }
        .voters-table thead { display: none; }
        .voters-table, .voters-table tbody, .voters-table tr, .voters-table td {
          display: block;
          width: 100% !important;
          min-width: 0 !important;
        }
        .voters-table tr { border: 1px solid ${COLORS.line}; border-radius: 10px; margin-bottom: 10px; padding: 8px 12px; }
        .voters-table td {
          border: none !important;
          padding: 5px 2px !important;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          word-break: break-word;
        }
        .voters-table td::before {
          content: attr(data-label);
          font-weight: 600;
          color: ${COLORS.inkSoft};
          font-size: 11px;
          text-transform: uppercase;
        }
        .voters-table td:last-child::before { content: ""; }
        .voters-table td:last-child { flex-direction: row; justify-content: flex-end; }
        .file-input-row { flex-direction: column; align-items: stretch; }
        .file-input-row > button { width: 100%; }
      }
      @media (max-width: 400px) {
        .zone-card-top { flex-direction: column; }
        .zone-card-top .medidor-wrap { align-self: center; }
      }
      @keyframes cardFadeInUp {
        from { opacity: 0; transform: translateY(18px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes leaderPulse {
        0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color, rgba(28,154,214,0.35)), 0 6px 16px rgba(8,36,54,0.06); }
        50% { box-shadow: 0 0 0 9px rgba(28,154,214,0), 0 6px 16px rgba(8,36,54,0.06); }
      }
      .candidate-doc-card {
        opacity: 0;
        animation: cardFadeInUp 0.55s cubic-bezier(.21,.9,.32,1) both;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .candidate-doc-card:hover {
        transform: translateY(-3px);
      }
      .candidate-doc-card.is-leader {
        animation: cardFadeInUp 0.55s cubic-bezier(.21,.9,.32,1) both, leaderPulse 2.4s ease-in-out 0.6s infinite;
      }
      .candidate-doc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 16px;
        margin-top: 4px;
      }
      @media (max-width: 640px) {
        .candidate-doc-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      }
      @media (max-width: 360px) {
        .candidate-doc-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

// ============================================================
// LAYOUT BASE
// ============================================================
const styles = {
  page: {
    minHeight: "100%",
    background: `radial-gradient(1200px 500px at 90% -10%, #EAF6FF 0%, ${COLORS.bg} 55%)`,
    fontFamily: "'Inter', sans-serif",
    color: COLORS.ink,
    display: "flex",
    flexDirection: "column",
  },
  main: {
    flex: 1,
    width: "100%",
    maxWidth: 920,
    margin: "0 auto",
    padding: "28px 20px 60px",
  },
  demoBanner: {
    background: `${COLORS.orange}14`,
    border: `1px solid ${COLORS.orange}44`,
    color: "#7A4408",
    fontSize: 12.5,
    lineHeight: 1.5,
    padding: "10px 12px",
    borderRadius: 10,
    marginTop: 10,
  },
  statRow: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 },
  statBadge: {
    background: "#fff",
    border: `1.5px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: "12px 18px",
    minWidth: 130,
  },
  candidateCard: {
    background: "#fff",
    border: `1.5px solid ${COLORS.line}`,
    borderRadius: 16,
    padding: 20,
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(8,36,54,0.05)",
    transition: "all 0.15s ease",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: `${COLORS.blue}14`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
    overflow: "hidden",
  },
};

const styles_p = { fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.5, margin: "4px 0" };
const styles_input = {
  border: `1.5px solid ${COLORS.line}`,
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 14.5,
  outline: "none",
  width: "100%",
  background: "#fff",
};

function ErrorText({ children }) {
  return <div style={{ color: COLORS.danger, fontSize: 13, fontWeight: 500 }}>{children}</div>;
}

function PrimaryButton({ children, full, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.blueDark})`,
        color: "#fff",
        border: "none",
        borderRadius: 10,
        padding: "12px 18px",
        fontWeight: 700,
        fontSize: 14.5,
        width: full ? "100%" : "auto",
        opacity: props.disabled ? 0.6 : 1,
        boxShadow: `0 6px 16px ${COLORS.blue}40`,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, full, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: "#fff",
        color: COLORS.ink,
        border: `1.5px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "12px 18px",
        fontWeight: 600,
        fontSize: 14.5,
        width: full ? "100%" : "auto",
      }}
    >
      {children}
    </button>
  );
}

function TextButton({ children, danger, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: "none",
        border: "none",
        color: danger ? COLORS.danger : COLORS.blue,
        fontWeight: 600,
        fontSize: 13,
        padding: "8px 0",
      }}
    >
      {children}
    </button>
  );
}

function Card({ children }) {
  return (
    <div
      className="card"
      style={{
        background: COLORS.card,
        borderRadius: 16,
        padding: 24,
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 1px 3px rgba(8,36,54,0.06), 0 10px 30px rgba(8,36,54,0.06)",
        border: `1px solid ${COLORS.line}`,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, icon, center }) {
  return (
    <h2
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 19,
        margin: "0 0 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        gap: 8,
      }}
    >
      {icon}
      {children}
    </h2>
  );
}

function DataRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.line}` }}>
      <span style={{ fontSize: 12.5, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, margin: "0 0 4px" }}>{title}</h2>
      <p style={{ ...styles_p }}>{subtitle}</p>
    </div>
  );
}

function StatBadge({ label, value, accent }) {
  return (
    <div className="stat-badge" style={{ ...styles.statBadge, borderColor: accent || COLORS.line }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: accent || COLORS.ink }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.inkSoft, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

// ============================================================
// HEADER - SOLO MUESTRA RESULTADOS SI ES ADMIN
// ============================================================
function Header({ tab, setTab, isAdmin, onAdminLoginClick }) {
  // Definir items según rol
  let items = [
    { id: "votar", label: "🗳️ Votar" },
  ];
  
  // Solo agregar Resultados y Admin si es administrador
  if (isAdmin) {
    items.push(
      { id: "resultados", label: "📊 Resultados" },
      { id: "admin", label: "⚙️ Administración" }
    );
  } else {
    // Si no es admin, mostrar "🔐 Admin" que abre el login
    items.push({ id: "admin", label: "🔐 Admin" });
  }
  
  return (
    <header
      style={{
        background: COLORS.navy,
        padding: "14px 20px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "0 2px 14px rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="app-header-inner"
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={LOGO_SRC} alt="ElectroHuila" style={{ height: 30, objectFit: "contain" }} />
          <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: "#fff", fontSize: 15, letterSpacing: 0.3 }}>
            COCOLAB · Elecciones internas
          </span>
          {isAdmin ? (
            <span style={{ background: COLORS.orange, color: "#fff", fontSize: 10, padding: "2px 10px", borderRadius: 999, fontWeight: 700 }}>
              👑 ADMIN
            </span>
          ) : (
            <span style={{ background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 10, padding: "2px 10px", borderRadius: 999, fontWeight: 600 }}>
              👤 VOTANTE
            </span>
          )}
        </div>
        <nav className="app-nav" style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.06)", padding: 4, borderRadius: 10 }}>
          {items.map((it) => (
            <button
              key={it.id}
              className="app-nav-btn"
              onClick={() => {
                if (it.id === "admin" && !isAdmin) {
                  onAdminLoginClick();
                } else {
                  setTab(it.id);
                }
              }}
              style={{
                border: "none",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                background: tab === it.id ? COLORS.blue : "transparent",
                color: tab === it.id ? "#fff" : "rgba(255,255,255,0.72)",
                transition: "all 0.18s ease",
                ...(it.id === "admin" && !isAdmin ? {
                  background: tab === it.id ? COLORS.orange : "transparent",
                  color: tab === it.id ? "#fff" : "rgba(255,255,255,0.72)",
                } : {}),
              }}
            >
              {it.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer style={{ textAlign: "center", padding: "18px 20px 30px", color: COLORS.inkSoft, fontSize: 12.5 }}>
      Transmitimos Buena Energía · Plataforma de votación interna COCOLAB — prototipo funcional
    </footer>
  );
}

// ============================================================
// VOTAR FLOW
// ============================================================
function VotarFlow({ candidates, refreshAll }) {
  const [step, setStep] = useState("cedula");
  const [cedula, setCedula] = useState("");
  const [voter, setVoter] = useState(null);
  const [voteToken, setVoteToken] = useState(null);
  const [demoCode, setDemoCode] = useState(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function buscarCedula(e) {
    e.preventDefault();
    setErrMsg("");
    const clean = cedula.trim();
    if (!/^\d{5,12}$/.test(clean)) {
      setErrMsg("Ingresa un número de cédula válido (solo dígitos).");
      return;
    }
    try {
      const v = await api.lookupVoter(clean);
      setVoter({ ...v, cedula: clean });
      setStep("confirmar");
    } catch (err) {
      if (err.payload && err.payload.error === "yavoto") {
        setVoter({ nombre: err.payload.nombre, cedula: clean });
        setStep("yavoto");
        return;
      }
      setErrMsg(err.message || "No encontramos esa cédula en el censo de votantes.");
    }
  }

  async function enviarCodigo() {
    setSending(true);
    setOtpError("");
    try {
      const resp = await api.requestOtp(voter.cedula);
      setDemoCode(resp.demoCode || null);
      setStep("otp");
    } catch (err) {
      setErrMsg(err.message || "No se pudo enviar el código.");
    } finally {
      setSending(false);
    }
  }

  async function verificarCodigo(e) {
    e.preventDefault();
    setOtpError("");
    try {
      const resp = await api.verifyOtp(voter.cedula, otpInput.trim());
      setVoteToken(resp.voteToken);
      setStep("seleccion");
    } catch (err) {
      setOtpError(err.message || "Código incorrecto.");
    }
  }

  async function confirmarVoto() {
    if (!selected || !voteToken) return;
    try {
      await api.castVote(voteToken, selected.id);
      await refreshAll();
      setStep("listo");
    } catch (err) {
      if (err.status === 409) {
        setStep("yavoto");
        return;
      }
      setErrMsg(err.message || "No se pudo registrar tu voto.");
      setStep("cedula");
    }
  }

  function reiniciar() {
    setStep("cedula");
    setCedula("");
    setVoter(null);
    setVoteToken(null);
    setDemoCode(null);
    setOtpInput("");
    setOtpError("");
    setSelected(null);
    setErrMsg("");
  }

  const zonaCandidatos = voter ? candidates[voter.zona] || [] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <StepDots step={step} />

      {step === "cedula" && (
        <Card>
          <CardTitle icon={<Bolt />}>Verifica tu identidad</CardTitle>
          <p style={styles_p}>Ingresa tu número de cédula para comenzar. Tu voto es secreto.</p>
          <form onSubmit={buscarCedula} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            <input
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
              placeholder="N.º de cédula"
              inputMode="numeric"
              style={styles_input}
              autoFocus
            />
            {errMsg && <ErrorText>{errMsg}</ErrorText>}
            <PrimaryButton type="submit">Buscar mis datos</PrimaryButton>
          </form>
          <p style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 14 }}>
            Cédulas de prueba: 12345678 · 23456789 · 34567890 · 45678901
          </p>
        </Card>
      )}

      {step === "yavoto" && (
        <Card>
          <CardTitle icon={<Bolt color={COLORS.danger} />}>Ya registramos tu voto</CardTitle>
          <p style={styles_p}>{voter?.nombre}, esta cédula ya participó en esta votación.</p>
          <SecondaryButton onClick={reiniciar}>Volver al inicio</SecondaryButton>
        </Card>
      )}

      {step === "confirmar" && voter && (
        <Card>
          <CardTitle icon={<Bolt />}>Confirma tus datos</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            <DataRow label="Nombre completo" value={voter.nombre} />
            <DataRow label="Celular registrado" value={voter.movilMasked} />
            <DataRow label="Zona" value={voter.zona} />
          </div>
          <p style={{ ...styles_p, marginTop: 16 }}>Te enviaremos un código de verificación por SMS.</p>
          <PrimaryButton onClick={enviarCodigo} disabled={sending}>
            {sending ? "Enviando…" : "Enviar código"}
          </PrimaryButton>
          <TextButton onClick={reiniciar}>No soy yo, volver</TextButton>
        </Card>
      )}

      {step === "otp" && voter && (
        <Card>
          <CardTitle icon={<Bolt />}>Ingresa el código</CardTitle>
          <p style={styles_p}>Enviamos un código a {voter.movilMasked}.</p>
          <div style={styles.demoBanner}>
            <strong>DEMO</strong> — Código simulado: <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{demoCode}</span>
          </div>
          <form onSubmit={verificarCodigo} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <input
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              inputMode="numeric"
              style={{ ...styles_input, textAlign: "center", letterSpacing: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 22 }}
              autoFocus
            />
            {otpError && <ErrorText>{otpError}</ErrorText>}
            <PrimaryButton type="submit">Verificar código</PrimaryButton>
            <TextButton type="button" onClick={enviarCodigo}>Reenviar código</TextButton>
          </form>
        </Card>
      )}

      {step === "seleccion" && voter && (
        <div style={{ width: "100%", maxWidth: 640 }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, margin: 0 }}>
              Elige tu candidato — {voter.zona}
            </h2>
            <p style={{ ...styles_p, textAlign: "center" }}>Tu selección es anónima.</p>
          </div>
          {zonaCandidatos.length === 0 ? (
            <Card><p style={styles_p}>Aún no hay candidatos cargados para tu zona.</p></Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {zonaCandidatos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  style={{
                    ...styles.candidateCard,
                    borderColor: selected?.id === c.id ? COLORS.blue : COLORS.line,
                    boxShadow: selected?.id === c.id ? `0 0 0 3px ${COLORS.blue}33` : styles.candidateCard.boxShadow,
                  }}
                >
                  <div style={styles.avatar}>
                    {c.foto ? (
                      <img src={c.foto} alt={c.nombre} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    ) : (
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: COLORS.blue, fontSize: 20 }}>
                        {initials(c.nombre)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 10 }}>{c.nombre}</div>
                  {selected?.id === c.id && <div style={{ marginTop: 6, fontSize: 12, color: COLORS.blue, fontWeight: 700 }}>Seleccionado</div>}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <ConfirmModal candidate={selected} onCancel={() => setSelected(null)} onConfirm={confirmarVoto} />
            </div>
          )}
        </div>
      )}

      {step === "listo" && (
        <Card>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 42 }}>⚡</div>
            <CardTitle center>¡Voto registrado con éxito!</CardTitle>
            <p style={{ ...styles_p, textAlign: "center" }}>Gracias por participar en las elecciones internas.</p>
            <SecondaryButton onClick={reiniciar}>Volver al inicio</SecondaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}

function StepDots({ step }) {
  const order = ["cedula", "confirmar", "otp", "seleccion", "listo"];
  const idx = Math.max(order.indexOf(step), 0);
  if (step === "yavoto") return null;
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
      {order.map((s, i) => (
        <div key={s} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 4, background: i <= idx ? COLORS.blue : COLORS.line, transition: "all 0.25s ease" }} />
      ))}
    </div>
  );
}

function ConfirmModal({ candidate, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,36,54,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.card, borderRadius: 18, padding: 28, width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 24px 60px rgba(8,36,54,0.35)" }}>
        <div style={{ ...styles.avatar, width: 84, height: 84, margin: "0 auto" }}>
          {candidate.foto ? (
            <img src={candidate.foto} alt={candidate.nombre} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          ) : (
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: COLORS.blue, fontSize: 26 }}>{initials(candidate.nombre)}</span>
          )}
        </div>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", margin: "14px 0 4px" }}>{candidate.nombre}</h3>
        <p style={{ ...styles_p, textAlign: "center" }}>¿Confirmas tu voto por este candidato? No podrás cambiarlo después.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <SecondaryButton onClick={onCancel} full>Cancelar</SecondaryButton>
          <PrimaryButton full disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); }}>
            {busy ? "Registrando…" : "Confirmar voto"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RESULTADOS - SOLO VISIBLE PARA ADMIN
// ============================================================
function Resultados() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const results = await api.getResults();
      setData(results);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) return <p style={styles_p}>Cargando resultados…</p>;
  if (!data) return <p style={styles_p}>No se pudieron cargar los resultados.</p>;

  const zones = data.zones || DEFAULT_ZONES;
  const candidates = data.candidates || {};
  const votes = data.votes || {};
  const totalVoters = data.stats?.totalVoters || 0;
  const totalVoted = data.stats?.totalVoted || 0;
  const participacion = totalVoters ? Math.round((totalVoted / totalVoters) * 100) : 0;
  const palette = [COLORS.blue, COLORS.orange, COLORS.green, "#8E6FD6", "#E24C4C", "#2CB1A3"];

  return (
    <div>
      <SectionHeader 
        title="📊 Resultados en vivo" 
        subtitle="Panel exclusivo para administradores · Se actualiza en tiempo real." 
      />
      <div className="stat-row" style={{ ...styles.statRow }}>
        <StatBadge label="Votantes habilitados" value={totalVoters} />
        <StatBadge label="Ya votaron" value={totalVoted} />
        <StatBadge label="Participación" value={`${participacion}%`} accent={COLORS.green} />
      </div>
      <div style={{ display: "grid", gap: 18, marginTop: 22 }}>
        {zones.map((zona) => {
          const zc = candidates[zona] || [];
          const zv = votes[zona] || {};
          const segments = zc.map((c, i) => ({ id: c.id, candidate: c, value: zv[c.id] || 0, color: palette[i % palette.length] }));
          const totalZona = segments.reduce((a, s) => a + s.value, 0);
          const maxVotes = Math.max(0, ...segments.map((s) => s.value));
          const ordered = segments.slice().sort((a, b) => b.value - a.value);

          return (
            <div key={zona} className="card" style={{ background: COLORS.card, borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(8,36,54,0.06), 0 10px 30px rgba(8,36,54,0.06)", border: `1px solid ${COLORS.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                <div className="medidor-wrap" style={{ flexShrink: 0 }}>
                  <Medidor segments={segments.length ? segments : [{ value: 1, color: COLORS.line }]} size={92} />
                </div>
                <div>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>{zona}</h3>
                  <p style={{ ...styles_p, margin: "4px 0 0" }}>{totalZona} voto{totalZona === 1 ? "" : "s"} registrado{totalZona === 1 ? "" : "s"} en esta zona</p>
                </div>
              </div>
              {zc.length === 0 && <p style={styles_p}>Sin candidatos registrados.</p>}
              <div className="candidate-doc-grid">
                {ordered.map((s, i) => {
                  const pct = totalZona ? Math.round((s.value / totalZona) * 100) : 0;
                  const isLeader = totalZona > 0 && s.value === maxVotes;
                  return (
                    <div key={s.id} className={`candidate-doc-card${isLeader && totalZona > 0 ? " is-leader" : ""}`} style={{ "--pulse-color": `${s.color}55`, animationDelay: `${i * 90}ms`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", background: isLeader && totalZona > 0 ? `${s.color}0A` : "#fff", border: `1.5px solid ${isLeader && totalZona > 0 ? s.color : COLORS.line}`, borderRadius: 16, padding: "16px 14px 18px" }}>
                      {isLeader && totalZona > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: "#fff", background: s.color, padding: "3px 10px", borderRadius: 999, marginBottom: 10 }}>LIDERANDO</span>
                      )}
                      <div style={{ width: "100%", maxWidth: 132, aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden", background: COLORS.bg, border: `2.5px solid ${isLeader && totalZona > 0 ? s.color : COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {s.candidate.foto ? <img src={s.candidate.foto} alt={s.candidate.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 30, fontWeight: 700, color: COLORS.blue }}>{initials(s.candidate.nombre)}</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 12, lineHeight: 1.25, minHeight: 36, display: "flex", alignItems: "center" }}>{s.candidate.nombre}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 30, color: s.color, marginTop: 6, lineHeight: 1 }}>{pct}%</div>
                      <div style={{ width: "100%", height: 7, background: COLORS.bg, borderRadius: 4, overflow: "hidden", marginTop: 10 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.6s cubic-bezier(.21,.9,.32,1)" }} />
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 8, fontWeight: 600 }}>{s.value} voto{s.value === 1 ? "" : "s"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ADMIN - VERSION CON FILTROS Y EXCEL
// ============================================================
function Admin({ config, onLogout }) {
  const [section, setSection] = useState("candidatos");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <SectionHeader title="⚙️ Panel de administración" subtitle="Gestiona candidatos, votantes y consulta el reporte final." />
        <TextButton onClick={onLogout}>Cerrar sesión</TextButton>
      </div>
      <div className="admin-section-tabs" style={{ display: "flex", gap: 8, marginBottom: 20, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { id: "candidatos", label: "Candidatos" },
          { id: "votantes", label: "Votantes" },
          { id: "reporte", label: "Reporte final" },
        ].map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{ border: `1px solid ${section === s.id ? COLORS.blue : COLORS.line}`, background: section === s.id ? `${COLORS.blue}14` : "#fff", color: section === s.id ? COLORS.blue : COLORS.ink, padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13.5 }}>
            {s.label}
          </button>
        ))}
      </div>
      {section === "candidatos" && <AdminCandidatos config={config} />}
      {section === "votantes" && <AdminVotantes config={config} />}
      {section === "reporte" && <AdminReporte />}
    </div>
  );
}

function AdminCandidatos({ config }) {
  const zones = config.zones || DEFAULT_ZONES;
  const [zona, setZona] = useState(zones[0]);
  const [nombre, setNombre] = useState("");
  const [foto, setFoto] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [candidates, setCandidates] = useState({});
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cd = await api.getAdminCandidates();
      setCandidates(cd);
    } catch (e) {
      setErr(e.message || "No se pudieron cargar los candidatos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function agregar() {
    if (!nombre.trim()) return;
    setErr("");
    try {
      await api.addCandidate(zona, nombre.trim(), foto);
      setNombre("");
      setFoto("");
      if (fileRef.current) fileRef.current.value = "";
      setMsg("Candidato agregado.");
      await load();
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setErr(e.message || "No se pudo agregar el candidato.");
    }
  }

  async function eliminar(id) {
    setErr("");
    try {
      await api.deleteCandidate(id);
      await load();
    } catch (e) {
      setErr(e.message || "No se pudo eliminar el candidato.");
    }
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result);
    reader.readAsDataURL(f);
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card>
        <CardTitle>Agregar candidato</CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <select value={zona} onChange={(e) => setZona(e.target.value)} style={styles_input}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" style={styles_input} />
          <div className="file-input-row"><input ref={fileRef} type="file" accept="image/*" onChange={onFile} /></div>
          {foto && <div style={{ display: "flex", justifyContent: "center" }}><img src={foto} alt="preview" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} /></div>}
          <PrimaryButton onClick={agregar}>Guardar candidato</PrimaryButton>
          {msg && <div style={{ color: COLORS.green, fontSize: 13, fontWeight: 600, textAlign: "center" }}>{msg}</div>}
          {err && <ErrorText>{err}</ErrorText>}
        </div>
      </Card>
      {loading && <p style={styles_p}>Cargando candidatos…</p>}
      {!loading && zones.map((z) => (
        <Card key={z}>
          <CardTitle>{z}</CardTitle>
          {(candidates[z] || []).length === 0 && <p style={styles_p}>Sin candidatos.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {(candidates[z] || []).map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                <div style={{ ...styles.avatar, width: 36, height: 36 }}>
                  {c.foto ? <img src={c.foto} alt={c.nombre} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.blue }}>{initials(c.nombre)}</span>}
                </div>
                <span style={{ flex: 1, fontSize: 14 }}>{c.nombre}</span>
                <TextButton onClick={() => eliminar(c.id)} danger>Eliminar</TextButton>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// ADMIN VOTANTES - CON FILTROS Y EXPORTACIÓN A EXCEL
// ============================================================
function AdminVotantes({ config }) {
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [movil, setMovil] = useState("");
  const [zona, setZona] = useState((config.zones || DEFAULT_ZONES)[0]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  
  const [filterStatus, setFilterStatus] = useState("todos");
  const [searchText, setSearchText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getAdminVoters();
      setVoters(list);
    } catch (e) {
      setErr(e.message || "No se pudo cargar el censo.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function agregar() {
    if (!cedula.trim() || !nombre.trim() || !movil.trim()) return;
    setErr("");
    try {
      await api.addVoter(cedula.trim(), nombre.trim(), movil.trim(), zona);
      setCedula("");
      setNombre("");
      setMovil("");
      setMsg("Votante agregado al censo.");
      await load();
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setErr(e.message || "No se pudo agregar el votante.");
    }
  }

  async function eliminar(ced) {
    setErr("");
    try {
      await api.deleteVoter(ced);
      await load();
    } catch (e) {
      setErr(e.message || "No se pudo eliminar el votante.");
    }
  }

  async function onImportFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    setImportResult(null);
    setErr("");
    try {
      const text = await f.text();
      const rows = parseVotersCsv(text);
      const result = await api.importVoters(rows);
      setImportResult(result);
      await load();
    } catch (e) {
      setErr(e.message || "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const getFilteredVoters = () => {
    let filtered = [...voters];
    
    if (filterStatus === "pendientes") {
      filtered = filtered.filter(v => !v.voted);
    } else if (filterStatus === "votaron") {
      filtered = filtered.filter(v => v.voted);
    }
    
    if (searchText.trim()) {
      const search = searchText.trim().toLowerCase();
      filtered = filtered.filter(v => 
        v.cedula.includes(search) || 
        v.nombre.toLowerCase().includes(search)
      );
    }
    
    return filtered;
  };

  const exportVotersToCSV = () => {
    const filtered = getFilteredVoters();
    
    if (filtered.length === 0) {
      alert("No hay votantes para exportar con los filtros actuales.");
      return;
    }

    const headers = ['Cédula', 'Nombre', 'Zona', 'Estado', 'Celular'];
    const rows = filtered.map(v => [
      v.cedula,
      v.nombre,
      v.zona,
      v.voted ? 'Votó' : 'Pendiente',
      v.movil || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `votantes_${filterStatus}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const filteredVoters = getFilteredVoters();
  const totalPendientes = voters.filter(v => !v.voted).length;
  const totalVotaron = voters.filter(v => v.voted).length;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card>
        <CardTitle>Agregar votante al censo</CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <input value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))} placeholder="Cédula" style={styles_input} />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" style={styles_input} />
          <input value={movil} onChange={(e) => setMovil(e.target.value.replace(/\D/g, ""))} placeholder="Celular" style={styles_input} />
          <select value={zona} onChange={(e) => setZona(e.target.value)} style={styles_input}>
            {(config.zones || DEFAULT_ZONES).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <PrimaryButton onClick={agregar}>Guardar votante</PrimaryButton>
          {msg && <div style={{ color: COLORS.green, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
          {err && <ErrorText>{err}</ErrorText>}
        </div>
      </Card>

      <Card>
        <CardTitle>Carga masiva por CSV</CardTitle>
        <p style={styles_p}>
          Sube un archivo con columnas <code>cedula,nombre,movil,zona</code>.
        </p>
        <div className="file-input-row" style={{ marginTop: 8 }}>
          <SecondaryButton type="button" onClick={downloadVotersCsvTemplate}>Descargar plantilla CSV</SecondaryButton>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} disabled={importing} />
        </div>
        {importing && <p style={{ ...styles_p, textAlign: "center" }}>Importando…</p>}
        {importResult && (
          <div style={{ marginTop: 10 }}>
            <div style={{ color: COLORS.green, fontSize: 13, fontWeight: 600, textAlign: "center" }}>
              {importResult.inserted} votante{importResult.inserted === 1 ? "" : "s"} importado{importResult.inserted === 1 ? "" : "s"}.
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.danger, textAlign: "center" }}>
                  {importResult.errors.length} fila{importResult.errors.length === 1 ? "" : "s"} con errores:
                </div>
                <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 4 }}>
                  {importResult.errors.map((er, i) => (
                    <div key={i} style={{ fontSize: 12, color: COLORS.inkSoft, padding: "2px 0" }}>
                      Fila {er.fila}: {er.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <CardTitle>Censo de votantes ({voters.length})</CardTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, background: COLORS.green + "22", padding: "4px 10px", borderRadius: 999, color: COLORS.green, fontWeight: 600 }}>
              ✅ {totalVotaron} votaron
            </span>
            <span style={{ fontSize: 12, background: COLORS.orange + "22", padding: "4px 10px", borderRadius: 999, color: COLORS.orange, fontWeight: 600 }}>
              ⏳ {totalPendientes} pendientes
            </span>
          </div>
        </div>

        <div style={{ 
          display: "flex", 
          flexWrap: "wrap", 
          gap: 10, 
          marginTop: 12,
          padding: 12,
          background: COLORS.bg,
          borderRadius: 10,
          alignItems: "center"
        }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setFilterStatus("todos")} style={{
              padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filterStatus === "todos" ? COLORS.blue : COLORS.line}`,
              background: filterStatus === "todos" ? COLORS.blue : "#fff", color: filterStatus === "todos" ? "#fff" : COLORS.ink,
              fontWeight: 600, fontSize: 12, cursor: "pointer"
            }}>📋 Todos ({voters.length})</button>
            <button onClick={() => setFilterStatus("pendientes")} style={{
              padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filterStatus === "pendientes" ? COLORS.orange : COLORS.line}`,
              background: filterStatus === "pendientes" ? COLORS.orange : "#fff", color: filterStatus === "pendientes" ? "#fff" : COLORS.ink,
              fontWeight: 600, fontSize: 12, cursor: "pointer"
            }}>⏳ Pendientes ({totalPendientes})</button>
            <button onClick={() => setFilterStatus("votaron")} style={{
              padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filterStatus === "votaron" ? COLORS.green : COLORS.line}`,
              background: filterStatus === "votaron" ? COLORS.green : "#fff", color: filterStatus === "votaron" ? "#fff" : COLORS.ink,
              fontWeight: 600, fontSize: 12, cursor: "pointer"
            }}>✅ Votaron ({totalVotaron})</button>
          </div>

          <div style={{ flex: 1, minWidth: 150 }}>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="🔍 Buscar por cédula o nombre..."
              style={{ ...styles_input, padding: "6px 12px", fontSize: 13 }}
            />
          </div>

          <button onClick={exportVotersToCSV} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", background: COLORS.green,
            color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap"
          }}>
            📊 Descargar CSV ({filteredVoters.length})
          </button>
        </div>

        {loading ? (
          <p style={styles_p}>Cargando…</p>
        ) : (
          <>
            <p style={{ ...styles_p, marginTop: 8, fontSize: 12 }}>
              Mostrando {filteredVoters.length} de {voters.length} votantes
              {searchText && ` · Buscando: "${searchText}"`}
            </p>
            <div style={{ maxHeight: 340, overflowY: "auto", overflowX: "auto", marginTop: 8 }}>
              <table className="voters-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: COLORS.inkSoft, borderBottom: `1px solid ${COLORS.line}` }}>
                    <th style={{ padding: "6px 4px" }}>Cédula</th>
                    <th style={{ padding: "6px 4px" }}>Nombre</th>
                    <th style={{ padding: "6px 4px" }}>Zona</th>
                    <th style={{ padding: "6px 4px" }}>Estado</th>
                    <th style={{ padding: "6px 4px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVoters.length === 0 ? (
                    <tr><td colSpan="5" style={{ textAlign: "center", padding: 20, color: COLORS.inkSoft }}>No hay votantes que coincidan con los filtros</td></tr>
                  ) : (
                    filteredVoters.map((v) => (
                      <tr key={v.cedula} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                        <td data-label="Cédula" style={{ padding: "6px 4px", fontFamily: "'JetBrains Mono', monospace" }}>{v.cedula}</td>
                        <td data-label="Nombre" style={{ padding: "6px 4px" }}>{v.nombre}</td>
                        <td data-label="Zona" style={{ padding: "6px 4px" }}>{v.zona}</td>
                        <td data-label="Estado" style={{ padding: "6px 4px" }}>
                          {v.voted ? <span style={{ color: COLORS.green, fontWeight: 700 }}>✅ Votó</span> : <span style={{ color: COLORS.orange, fontWeight: 600 }}>⏳ Pendiente</span>}
                        </td>
                        <td data-label="" style={{ padding: "6px 4px" }}>
                          <TextButton onClick={() => eliminar(v.cedula)} danger>Eliminar</TextButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function AdminReporte() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getReport();
        setReport(data);
      } catch (e) {
        setErr(e.message || "No se pudo cargar el reporte.");
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p style={styles_p}>Cargando reporte…</p>;
  if (err) return <ErrorText>{err}</ErrorText>;
  if (!report) return null;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card>
        <CardTitle>Resumen para gerencia</CardTitle>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, marginBottom: 4 }}>
          <SecondaryButton onClick={() => exportReportToExcel(report)}>Descargar Excel</SecondaryButton>
          <SecondaryButton onClick={() => exportReportToPdf(report)}>Descargar PDF</SecondaryButton>
        </div>
        <div style={styles.statRow}>
          <StatBadge label="Votantes habilitados" value={report.totalVoters} />
          <StatBadge label="Total votos emitidos" value={report.totalVoted} />
          <StatBadge label="Participación global" value={`${report.participacionGeneral}%`} accent={COLORS.green} />
        </div>
      </Card>
      {report.porZona.map((r) => (
        <Card key={r.zona}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>{r.zona}</h3>
            <span style={{ fontSize: 12, color: COLORS.inkSoft }}>Participación: {r.participacion}%</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: `${COLORS.orange}18`, color: COLORS.orange, fontWeight: 700, fontSize: 12.5, padding: "4px 10px", borderRadius: 999 }}>GANADOR</span>
            <span style={{ fontWeight: 700 }}>{r.ganador?.nombre || "—"}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {r.candidatos.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "4px 0" }}>
                <span>{c.nombre}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.inkSoft }}>{c.votos} votos</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, paddingTop: 6, borderTop: `1px solid ${COLORS.line}`, marginTop: 6 }}>
              <span>Total zona</span>
              <span>{r.candidatos.reduce((a, c) => a + c.votos, 0)} votos</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// EXPORT DEFAULT
// ============================================================
export default VotacionCocolab;