# Votación COCOLAB — ElectroHuila

Plataforma de votación electrónica interna. Frontend en React + Vite,
backend en Node.js + Express + SQLite.

## Diseño: voto secreto

El voto secreto está garantizado **a nivel de esquema de base de datos**,
no solo de código de aplicación:

- La tabla `voters` guarda identidad y si la persona **ya votó**
  (participación), pero nunca a quién votó.
- La tabla `vote_counts` guarda **solo contadores agregados** por zona y
  candidato. No tiene columna `voter_id` ni `cedula`, y no existe ninguna
  llave foránea que conecte un voto con una persona.

Es decir: es estructuralmente imposible reconstruir "quién votó por
quién" a partir de las tablas, incluso con acceso directo a la base de
datos.

## Estructura del proyecto

```
votacion-cocolab/
├── src/                 # Frontend (React + Vite)
│   ├── App.jsx           # UI completa: votar, resultados, admin
│   ├── api.js             # Cliente HTTP hacia el backend
│   ├── csv.js              # Parser CSV para importación de votantes
│   └── main.jsx
├── server/               # Backend (Node.js + Express + SQLite)
│   ├── index.js            # Punto de entrada
│   ├── db.js                # Esquema y seed inicial
│   ├── auth.js               # JWT para admin
│   ├── sms.js                  # Envío de OTP (modo DEMO por defecto)
│   ├── .env.example
│   └── routes/
│       ├── public.js          # Censo, OTP, voto, resultados
│       └── admin.js            # Login, CRUD, importación CSV, reporte
└── package.json          # Scripts raíz (frontend + orquestación)
```

## Instalación

Requiere Node.js 18 o superior.

```bash
npm run install:all
```

Esto instala las dependencias del frontend (raíz) y del backend
(`server/`).

## Configuración del backend

```bash
cp server/.env.example server/.env
```

Ajusta al menos:

- `JWT_SECRET` — usa un valor largo y aleatorio en producción.
- `ADMIN_USER` / `ADMIN_PASSWORD` — credenciales del administrador que se
  crea automáticamente la primera vez que arranca el servidor (solo si
  la base de datos está vacía). **Cámbialas después de la primera vez.**
- `SMS_PROVIDER` — `demo` (por defecto, no envía SMS real; el código OTP
  se devuelve en la respuesta de la API para poder probar el flujo) o
  `claro` para producción (ver más abajo).

## Arrancar en desarrollo

Backend y frontend juntos, con recarga en caliente del frontend:

```bash
npm run dev:all
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001 (el frontend lo consume vía proxy
  `/api`, configurado en `vite.config.js`)

O por separado, en dos terminales:

```bash
npm run server   # backend en :3001
npm run dev      # frontend en :5173
```

### Datos de prueba

El backend crea automáticamente, la primera vez que arranca (si la base
de datos está vacía):

- 5 votantes de prueba (cédulas `12345678`, `23456789`, `34567890`,
  `45678901`, `1075263487`) repartidos en 4 zonas.
- 2 candidatos por zona.
- Un usuario administrador (ver `server/.env`).

Como `SMS_PROVIDER=demo`, el código OTP se muestra directamente en la
pantalla de verificación (marcado como DEMO) y también se imprime en la
consola del backend — no hace falta un proveedor de SMS real para probar
todo el flujo.

## Build de producción del frontend

```bash
npm run build
```

Genera `dist/`. Sírvelo con cualquier hosting de archivos estáticos
(Netlify, Vercel, Nginx, etc.), apuntando `VITE_API_URL` a la URL pública
del backend si no vas a usar el proxy de Vite (que solo aplica en
desarrollo):

```bash
VITE_API_URL=https://tu-backend.tudominio.com/api npm run build
```

## Despliegue del backend

El backend es un servicio Node.js normal (Express + `better-sqlite3`).
Se puede desplegar en cualquier proveedor que corra Node (Railway,
Render, un VPS con PM2, un contenedor Docker, etc.):

1. Copia `server/` al servidor (o todo el repo).
2. `npm install` dentro de `server/`.
3. Configura las variables de entorno de `server/.env.example` como
   variables de entorno del proveedor (o un archivo `.env` real).
4. Arranca con `npm start` (dentro de `server/`) o con un gestor de
   procesos como PM2: `pm2 start index.js --name votacion-backend`.
5. Configura HTTPS (vía el proveedor o un proxy reverso como Nginx/
   Caddy) — las cédulas, celulares y tokens de sesión no deben viajar
   sin cifrar.
6. Haz backup periódico del archivo SQLite (`server/votacion.db` por
   defecto, o lo que definas en `DB_PATH`).

## Integración real de SMS (Claro Empresas u otro proveedor)

El envío de OTP está aislado en un único archivo: `server/sms.js`. Para
pasar a producción:

1. Consigue las credenciales del proveedor (API URL, token).
2. Complétalas en `server/.env` (`CLARO_API_URL`, `CLARO_API_TOKEN` o las
   que correspondan).
3. Implementa la llamada real dentro de `sendViaClaro()` en
   `server/sms.js` — hay un ejemplo comentado como punto de partida.
4. Cambia `SMS_PROVIDER=claro` en `server/.env`.

Ningún otro archivo necesita tocarse para este cambio.

## Notas sobre el reporte final

Por diseño, el reporte de administración (`AdminReporte` /
`GET /api/admin/report`) muestra **ganadores y conteos por zona**, no el
detalle de qué candidato eligió cada persona — eso protegería el voto
secreto incluso frente a quien tiene acceso al panel de administración.

Si un proceso concreto necesitara trazabilidad nominal por una razón
legal específica, es una decisión que debe autorizar formalmente
gerencia/legal, y implica cambiar el modelo de datos descrito arriba
(uniría intencionalmente lo que hoy está separado a propósito).

## Seguridad — checklist antes de un despliegue real

- [ ] Cambiar `JWT_SECRET`, `ADMIN_USER` y `ADMIN_PASSWORD` de los
      valores de ejemplo.
- [ ] Servir todo por HTTPS.
- [ ] Configurar `SMS_PROVIDER=claro` (o el proveedor real) antes de una
      votación real — el modo demo expone el código OTP en la respuesta
      de la API.
- [ ] Restringir CORS en `server/index.js` al dominio real del frontend
      en vez del wildcard por defecto de desarrollo.
- [ ] Definir una política de backups del archivo SQLite.
