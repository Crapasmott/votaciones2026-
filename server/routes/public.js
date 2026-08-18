const express = require("express");
const crypto = require("crypto");
const { db, DEFAULT_ZONES } = require("../db");
const { sendOtpSms } = require("../sms");

const router = express.Router();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutos
const VOTE_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function maskPhone(m) {
  if (!m || m.length < 4) return m || "";
  return `${m.slice(0, 3)}****${m.slice(-2)}`;
}

function genOtp() {
  return String(crypto.randomInt(100000, 999999));
}

/* ---------- Config pública (zonas) ---------- */
router.get("/config", (req, res) => {
  const zones = db.prepare("SELECT name FROM zones ORDER BY name").all().map((r) => r.name);
  res.json({ zones: zones.length ? zones : DEFAULT_ZONES });
});

/* ---------- Candidatos por zona (público, para la boleta) ---------- */
router.get("/candidates", (req, res) => {
  const rows = db.prepare("SELECT id, zona, nombre, foto FROM candidates ORDER BY zona, nombre").all();
  const byZone = {};
  rows.forEach((c) => {
    if (!byZone[c.zona]) byZone[c.zona] = [];
    byZone[c.zona].push({ id: c.id, nombre: c.nombre, foto: c.foto || "" });
  });
  res.json(byZone);
});

/* ---------- Resultados agregados (público) ---------- */
router.get("/results", (req, res) => {
  const zones = db.prepare("SELECT name FROM zones ORDER BY name").all().map((r) => r.name);
  const candidates = db.prepare("SELECT id, zona, nombre, foto FROM candidates").all();
  const counts = db.prepare("SELECT zona, candidate_id, count FROM vote_counts").all();
  const totalVoters = db.prepare("SELECT COUNT(*) c FROM voters").get().c;
  const totalVoted = db.prepare("SELECT COUNT(*) c FROM voters WHERE voted = 1").get().c;

  const countMap = {};
  counts.forEach((r) => {
    countMap[`${r.zona}::${r.candidate_id}`] = r.count;
  });

  const candidatesByZone = {};
  const votesByZone = {};
  candidates.forEach((c) => {
    if (!candidatesByZone[c.zona]) candidatesByZone[c.zona] = [];
    candidatesByZone[c.zona].push({ id: c.id, nombre: c.nombre, foto: c.foto || "" });
    if (!votesByZone[c.zona]) votesByZone[c.zona] = {};
    votesByZone[c.zona][c.id] = countMap[`${c.zona}::${c.id}`] || 0;
  });

  res.json({
    zones: zones.length ? zones : DEFAULT_ZONES,
    candidates: candidatesByZone,
    votes: votesByZone,
    stats: { totalVoters, totalVoted },
  });
});

/* ---------- 1) Buscar votante por cédula ---------- */
router.post("/voter/lookup", (req, res) => {
  const cedula = String(req.body.cedula || "").trim();
  if (!cedula) return res.status(400).json({ error: "Cédula requerida" });

  const voter = db.prepare("SELECT * FROM voters WHERE cedula = ?").get(cedula);
  if (!voter) {
    return res.status(404).json({ error: "No encontramos esa cédula en el censo." });
  }
  if (voter.voted) {
    return res.status(409).json({
      error: "yavoto",
      nombre: voter.nombre,
      message: "Esta cédula ya participó en esta votación.",
    });
  }

  res.json({
    nombre: voter.nombre,
    zona: voter.zona,
    movilMasked: maskPhone(voter.movil),
  });
});

/* ---------- 2) Solicitar OTP ---------- */
router.post("/otp/request", async (req, res) => {
  const cedula = String(req.body.cedula || "").trim();
  const voter = db.prepare("SELECT * FROM voters WHERE cedula = ?").get(cedula);
  if (!voter) return res.status(404).json({ error: "Votante no encontrado" });
  if (voter.voted) return res.status(409).json({ error: "Esta cédula ya participó en esta votación." });

  const code = genOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  db.prepare(
    `INSERT INTO otp_codes (cedula, code, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT(cedula) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`
  ).run(cedula, code, expiresAt);

  const result = await sendOtpSms(voter.movil, code);

  const payload = {
    ok: true,
    movilMasked: maskPhone(voter.movil),
    expiresInSeconds: OTP_TTL_MS / 1000,
  };
  // En modo demo devolvemos el código para poder probar sin SMS real.
  if (result.provider === "demo") payload.demoCode = code;

  res.json(payload);
});

/* ---------- 3) Verificar OTP -> emite vote_token de un solo uso ---------- */
router.post("/otp/verify", (req, res) => {
  const cedula = String(req.body.cedula || "").trim();
  const code = String(req.body.code || "").trim();

  const voter = db.prepare("SELECT * FROM voters WHERE cedula = ?").get(cedula);
  if (!voter) return res.status(404).json({ error: "Votante no encontrado" });
  if (voter.voted) return res.status(409).json({ error: "Esta cédula ya participó en esta votación." });

  const rec = db.prepare("SELECT * FROM otp_codes WHERE cedula = ?").get(cedula);
  if (!rec) return res.status(400).json({ error: "Solicita un nuevo código." });
  if (Date.now() > rec.expires_at) {
    return res.status(400).json({ error: "El código expiró. Solicita uno nuevo." });
  }
  if (rec.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ error: "Demasiados intentos. Solicita un nuevo código." });
  }
  if (code !== rec.code) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE cedula = ?").run(cedula);
    return res.status(400).json({ error: "Código incorrecto." });
  }

  // Código correcto: se consume el OTP y se emite un token de voto de un solo uso.
  db.prepare("DELETE FROM otp_codes WHERE cedula = ?").run(cedula);

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + VOTE_TOKEN_TTL_MS;
  db.prepare(
    "INSERT INTO vote_tokens (token, cedula, zona, expires_at, used) VALUES (?, ?, ?, ?, 0)"
  ).run(token, cedula, voter.zona, expiresAt);

  res.json({ ok: true, voteToken: token, zona: voter.zona });
});

/* ---------- 4) Emitir voto (secreto) ---------- */
router.post("/vote", (req, res) => {
  const { voteToken, candidateId } = req.body;
  if (!voteToken || !candidateId) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const tokenRow = db.prepare("SELECT * FROM vote_tokens WHERE token = ?").get(voteToken);
  if (!tokenRow) return res.status(400).json({ error: "Token de voto inválido." });
  if (tokenRow.used) return res.status(409).json({ error: "Este token de voto ya fue usado." });
  if (Date.now() > tokenRow.expires_at) {
    return res.status(400).json({ error: "El token de voto expiró. Repite la verificación." });
  }

  const voter = db.prepare("SELECT * FROM voters WHERE cedula = ?").get(tokenRow.cedula);
  if (!voter) return res.status(404).json({ error: "Votante no encontrado" });
  if (voter.voted) return res.status(409).json({ error: "Esta cédula ya participó en esta votación." });

  const candidate = db
    .prepare("SELECT * FROM candidates WHERE id = ? AND zona = ?")
    .get(candidateId, tokenRow.zona);
  if (!candidate) {
    return res.status(400).json({ error: "Candidato inválido para esta zona." });
  }

  // Transacción: marca participación (sin candidato) + incrementa contador
  // agregado (sin cédula/voter_id) + consume el token. Todo o nada.
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE voters SET voted = 1, voted_at = ? WHERE cedula = ?"
    ).run(new Date().toISOString(), tokenRow.cedula);

    db.prepare(
      `INSERT INTO vote_counts (zona, candidate_id, count) VALUES (?, ?, 1)
       ON CONFLICT(zona, candidate_id) DO UPDATE SET count = count + 1`
    ).run(tokenRow.zona, candidateId);

    db.prepare("UPDATE vote_tokens SET used = 1 WHERE token = ?").run(voteToken);
  });
  tx();

  res.json({ ok: true });
});

module.exports = router;
