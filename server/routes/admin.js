const express = require("express");
const bcrypt = require("bcryptjs");
const { db, DEFAULT_ZONES } = require("../db");
const { signAdminToken, requireAdmin } = require("../auth");

const router = express.Router();

/* ---------- Login ---------- */
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);
  if (!admin) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

  const ok = bcrypt.compareSync(password || "", admin.password_hash);
  if (!ok) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

  const token = signAdminToken(admin.username);
  res.json({ token, username: admin.username });
});

/* Todas las rutas siguientes requieren token admin */
router.use(requireAdmin);

/* ---------- Zonas ---------- */
router.get("/zones", (req, res) => {
  const zones = db.prepare("SELECT name FROM zones ORDER BY name").all().map((r) => r.name);
  res.json({ zones: zones.length ? zones : DEFAULT_ZONES });
});

/* ---------- Candidatos ---------- */
router.get("/candidates", (req, res) => {
  const rows = db.prepare("SELECT id, zona, nombre, foto FROM candidates ORDER BY zona, nombre").all();
  const byZone = {};
  rows.forEach((c) => {
    if (!byZone[c.zona]) byZone[c.zona] = [];
    byZone[c.zona].push({ id: c.id, nombre: c.nombre, foto: c.foto || "" });
  });
  res.json(byZone);
});

router.post("/candidates", (req, res) => {
  const { zona, nombre, foto } = req.body;
  if (!zona || !nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Zona y nombre son obligatorios" });
  }
  const id = `${zona}-${Date.now()}`;
  db.prepare("INSERT INTO candidates (id, zona, nombre, foto) VALUES (?, ?, ?, ?)").run(
    id,
    zona,
    nombre.trim(),
    foto || ""
  );
  res.json({ ok: true, id });
});

router.delete("/candidates/:id", (req, res) => {
  db.prepare("DELETE FROM candidates WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM vote_counts WHERE candidate_id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Votantes ---------- */
router.get("/voters", (req, res) => {
  const rows = db
    .prepare("SELECT cedula, nombre, movil, zona, voted, voted_at FROM voters ORDER BY nombre")
    .all();
  res.json(
    rows.map((v) => ({
      cedula: v.cedula,
      nombre: v.nombre,
      movil: v.movil,
      zona: v.zona,
      voted: !!v.voted,
      votedAt: v.voted_at,
    }))
  );
});

router.post("/voters", (req, res) => {
  const { cedula, nombre, movil, zona } = req.body;
  if (!cedula || !nombre || !movil || !zona) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }
  const clean = String(cedula).trim();
  const existing = db.prepare("SELECT cedula FROM voters WHERE cedula = ?").get(clean);
  if (existing) return res.status(409).json({ error: "Ya existe un votante con esa cédula" });

  db.prepare(
    "INSERT INTO voters (cedula, nombre, movil, zona, voted) VALUES (?, ?, ?, ?, 0)"
  ).run(clean, nombre.trim(), String(movil).trim(), zona);
  res.json({ ok: true });
});

router.delete("/voters/:cedula", (req, res) => {
  db.prepare("DELETE FROM voters WHERE cedula = ?").run(req.params.cedula);
  res.json({ ok: true });
});

/* ---------- Importación masiva CSV ---------- */
// Espera { rows: [{ cedula, nombre, movil, zona }, ...] } ya parseado en el frontend.
router.post("/voters/import", (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "Formato inválido" });

  const zones = new Set(
    db.prepare("SELECT name FROM zones").all().map((r) => r.name).length
      ? db.prepare("SELECT name FROM zones").all().map((r) => r.name)
      : DEFAULT_ZONES
  );

  const insert = db.prepare(
    "INSERT INTO voters (cedula, nombre, movil, zona, voted) VALUES (?, ?, ?, ?, 0)"
  );
  const exists = db.prepare("SELECT cedula FROM voters WHERE cedula = ?");

  const results = { inserted: 0, errors: [] };

  const tx = db.transaction(() => {
    rows.forEach((r, idx) => {
      const fila = idx + 2; // +2: encabezado + índice base 1
      const cedula = String(r.cedula || "").trim();
      const nombre = String(r.nombre || "").trim();
      const movil = String(r.movil || "").trim();
      const zona = String(r.zona || "").trim();

      if (!cedula || !nombre || !movil || !zona) {
        results.errors.push({ fila, error: "Faltan campos obligatorios" });
        return;
      }
      if (!zones.has(zona)) {
        results.errors.push({ fila, error: `Zona desconocida: "${zona}"` });
        return;
      }
      if (exists.get(cedula)) {
        results.errors.push({ fila, error: `Cédula duplicada: ${cedula}` });
        return;
      }
      insert.run(cedula, nombre, movil, zona);
      results.inserted += 1;
    });
  });
  tx();

  res.json(results);
});

/* ---------- Reporte final agregado ---------- */
router.get("/report", (req, res) => {
  const zones = db.prepare("SELECT name FROM zones ORDER BY name").all().map((r) => r.name);
  const effectiveZones = zones.length ? zones : DEFAULT_ZONES;

  const candidates = db.prepare("SELECT id, zona, nombre, foto FROM candidates").all();
  const counts = db.prepare("SELECT zona, candidate_id, count FROM vote_counts").all();
  const countMap = {};
  counts.forEach((r) => {
    countMap[`${r.zona}::${r.candidate_id}`] = r.count;
  });

  const totalVoters = db.prepare("SELECT COUNT(*) c FROM voters").get().c;
  const totalVoted = db.prepare("SELECT COUNT(*) c FROM voters WHERE voted = 1").get().c;

  const porZona = effectiveZones.map((zona) => {
    const votersZona = db.prepare("SELECT COUNT(*) c FROM voters WHERE zona = ?").get(zona).c;
    const votedZona = db
      .prepare("SELECT COUNT(*) c FROM voters WHERE zona = ? AND voted = 1")
      .get(zona).c;

    const candidatosZona = candidates
      .filter((c) => c.zona === zona)
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        votos: countMap[`${zona}::${c.id}`] || 0,
      }))
      .sort((a, b) => b.votos - a.votos);

    const ganador = candidatosZona[0] || null;

    return {
      zona,
      totalVotantes: votersZona,
      totalVotaron: votedZona,
      participacion: votersZona ? Math.round((votedZona / votersZona) * 100) : 0,
      candidatos: candidatosZona,
      ganador: ganador && ganador.votos > 0 ? ganador : null,
    };
  });

  res.json({
    totalVoters,
    totalVoted,
    participacionGeneral: totalVoters ? Math.round((totalVoted / totalVoters) * 100) : 0,
    porZona,
  });
});

module.exports = router;
