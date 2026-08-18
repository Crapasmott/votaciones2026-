require("dotenv").config();
const express = require("express");
const cors = require("cors");

const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3001;

// Dominios permitidos a consumir esta API.
// Agrega aquí CUALQUIER dominio de Vercel que uses (producción y previews).
const allowedOrigins = [
  "https://votaciones2026-tan.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Permite peticiones sin origin (Postman, curl, apps móviles, etc.)
      if (!origin) return callback(null, true);

      // Permite el dominio de producción y CUALQUIER preview de Vercel
      // de este proyecto (terminan en .vercel.app)
      const isAllowed =
        allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("No permitido por CORS: " + origin));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

// Manejo de errores no capturados
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`[server] Votación COCOLAB backend escuchando en http://localhost:${PORT}`);
});