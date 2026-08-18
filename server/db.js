const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "votacion.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* =========================================================================
   ESQUEMA
   -------------------------------------------------------------------------
   Voto secreto GARANTIZADO A NIVEL DE ESQUEMA, no solo de código de
   aplicación:

   - `voters`      guarda identidad + si YA VOTÓ (participación), pero
                    NUNCA a quién votó.
   - `vote_counts` guarda SOLO contadores agregados (zona, candidato,
                    total). No tiene columna voter_id ni cedula, y no
                    existe ninguna FK ni tabla intermedia que conecte un
                    voto a una persona. Es estructuralmente imposible
                    reconstruir "quién votó por quién" a partir de estas
                    tablas.
   ========================================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS zones (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS voters (
    cedula TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    movil TEXT NOT NULL,
    zona TEXT NOT NULL,
    voted INTEGER NOT NULL DEFAULT 0,
    voted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    zona TEXT NOT NULL,
    nombre TEXT NOT NULL,
    foto TEXT
  );

  -- Conteos agregados y anónimos. Sin vínculo a votante alguno.
  CREATE TABLE IF NOT EXISTS vote_counts (
    zona TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (zona, candidate_id)
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    cedula TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  -- Tokens de un solo uso emitidos tras verificar el OTP; habilitan el
  -- POST /vote sin volver a exponer la cédula ni permitir replays.
  CREATE TABLE IF NOT EXISTS vote_tokens (
    token TEXT PRIMARY KEY,
    cedula TEXT NOT NULL,
    zona TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL
  );
`);

/* ---------- Seed inicial (solo si la BD está vacía) ---------- */

const DEFAULT_ZONES = ["Zona Neiva", "Zona Norte", "Zona Sur", "Zona Occidente"];

const SEED_VOTERS = [
  ["12345678", "Carlos Andrés Perdomo Losada", "3112223344", "Zona Neiva"],
  ["23456789", "María Fernanda Trujillo Rojas", "3123334455", "Zona Norte"],
  ["34567890", "Jorge Iván Cabrera Motta", "3134445566", "Zona Sur"],
  ["45678901", "Diana Patricia Rivera Cuéllar", "3145556677", "Zona Occidente"],
  ["1075263487", "Luis Eduardo Salcedo Bermeo", "3156667788", "Zona Neiva"],
];

const SEED_CANDIDATES = {
  "Zona Neiva": [
    { id: "n1", nombre: "Ana Lucía Medina", foto: "" },
    { id: "n2", nombre: "Pedro Alonso Vargas", foto: "" },
  ],
  "Zona Norte": [
    { id: "no1", nombre: "Sandra Milena Ortiz", foto: "" },
    { id: "no2", nombre: "Camilo Ernesto Rojas", foto: "" },
  ],
  "Zona Sur": [
    { id: "s1", nombre: "Fabián Andrés Puentes", foto: "" },
    { id: "s2", nombre: "Liliana Marcela Cortés", foto: "" },
  ],
  "Zona Occidente": [
    { id: "o1", nombre: "Ricardo Alfonso Losada", foto: "" },
    { id: "o2", nombre: "Yolanda Esperanza Núñez", foto: "" },
  ],
};

function seedIfEmpty() {
  const zoneCount = db.prepare("SELECT COUNT(*) c FROM zones").get().c;
  if (zoneCount === 0) {
    const insZone = db.prepare("INSERT INTO zones (name) VALUES (?)");
    const tx = db.transaction((zones) => zones.forEach((z) => insZone.run(z)));
    tx(DEFAULT_ZONES);
  }

  const voterCount = db.prepare("SELECT COUNT(*) c FROM voters").get().c;
  if (voterCount === 0) {
    const ins = db.prepare(
      "INSERT INTO voters (cedula, nombre, movil, zona, voted) VALUES (?, ?, ?, ?, 0)"
    );
    const tx = db.transaction((rows) => rows.forEach((r) => ins.run(...r)));
    tx(SEED_VOTERS);
  }

  const candidateCount = db.prepare("SELECT COUNT(*) c FROM candidates").get().c;
  if (candidateCount === 0) {
    const ins = db.prepare(
      "INSERT INTO candidates (id, zona, nombre, foto) VALUES (?, ?, ?, ?)"
    );
    const tx = db.transaction((byZone) => {
      Object.entries(byZone).forEach(([zona, list]) => {
        list.forEach((c) => ins.run(c.id, zona, c.nombre, c.foto || ""));
      });
    });
    tx(SEED_CANDIDATES);
  }

  const adminCount = db.prepare("SELECT COUNT(*) c FROM admins").get().c;
  if (adminCount === 0) {
    const defaultUser = process.env.ADMIN_USER || "admin";
    const defaultPass = process.env.ADMIN_PASSWORD || "cambiar123";
    const hash = bcrypt.hashSync(defaultPass, 10);
    db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(
      defaultUser,
      hash
    );
    console.log(
      `[seed] Admin creado -> usuario: "${defaultUser}" contraseña: "${defaultPass}" (cámbiala luego, ver README)`
    );
  }
}

seedIfEmpty();

module.exports = { db, DEFAULT_ZONES };
