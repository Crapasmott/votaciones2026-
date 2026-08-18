/* =========================================================================
   sms.js — Envío de OTP por SMS.
   - Si las variables de entorno de Claro NO están configuradas, funciona
     en modo DEMO (no envía SMS real, solo devuelve el código para pruebas).
   - Si SÍ están configuradas, envía el SMS real vía la API REST de
     Claro Notifícame (Mensajería de Texto Empresarial - MEC).

   Variables de entorno requeridas para modo real (ponlas en server/.env
   cuando Claro te entregue las credenciales de tu cuenta):
     CLARO_API_URL     -> URL base de tu cuenta (Claro te la entrega,
                           ej: https://notificame.claro.com.co/rest/message)
     CLARO_API_KEY      -> API Key entregada por Claro
     CLARO_API_SECRET   -> API Secret entregada por Claro
     CLARO_SHORT_NAME   -> Nombre corto / remitente autorizado por Claro
   ========================================================================= */

const crypto = require("crypto");

const CLARO_API_URL = process.env.CLARO_API_URL || "";
const CLARO_API_KEY = process.env.CLARO_API_KEY || "";
const CLARO_API_SECRET = process.env.CLARO_API_SECRET || "";
const CLARO_SHORT_NAME = process.env.CLARO_SHORT_NAME || "";

const CLARO_CONFIGURED = Boolean(CLARO_API_URL && CLARO_API_KEY && CLARO_API_SECRET);

/**
 * Construye la firma HMAC-SHA1 requerida por la API REST de Claro Notifícame.
 * Formato: BASE64( HMAC-SHA1( <APIKEY><FECHA><PARAMETROS>, API_SECRET ) )
 * La fecha usada debe ser exactamente la misma que se envía en el header HTTP "Date".
 *
 * NOTA: Claro entrega, junto a las credenciales, la guía técnica exacta de tu
 * cuenta (algunas cuentas usan parámetros o rutas ligeramente distintas).
 * Verifica esta función contra esa guía antes de pasar a producción.
 */
function buildClaroSignature({ dateHeader, params }) {
  const paramsString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = `${CLARO_API_KEY}${dateHeader}${paramsString}`;
  const hmac = crypto.createHmac("sha1", CLARO_API_SECRET);
  hmac.update(base);
  return hmac.digest("base64");
}

async function sendViaClaro(movil, code) {
  const dateHeader = new Date().toUTCString();
  const mensaje = `Tu código de verificación COCOLAB es: ${code}. Válido por 5 minutos. No lo compartas.`;

  const params = {
    msisdn: movil,
    message: mensaje,
    ...(CLARO_SHORT_NAME ? { short_name: CLARO_SHORT_NAME } : {}),
  };

  const signature = buildClaroSignature({ dateHeader, params });

  const resp = await fetch(CLARO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Date: dateHeader,
      Authorization: `${CLARO_API_KEY}:${signature}`,
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Claro respondió ${resp.status}: ${text || "sin detalle"}`);
  }

  const data = await resp.json().catch(() => ({}));
  return { provider: "claro", raw: data };
}

/**
 * Envía el código OTP por SMS.
 * @param {string} movil - Número de celular del votante (sin máscara).
 * @param {string} code - Código de 6 dígitos.
 * @returns {Promise<{provider: "claro"|"demo", raw?: object}>}
 */
async function sendOtpSms(movil, code) {
  if (!CLARO_CONFIGURED) {
    // Modo DEMO: no se envía SMS real. El código se muestra en pantalla
    // (ver App.jsx, banner "DEMO") y se imprime en consola del backend.
    console.log(`[sms][DEMO] Código OTP para ${movil}: ${code}`);
    return { provider: "demo" };
  }

  try {
    return await sendViaClaro(movil, code);
  } catch (err) {
    // Si Claro falla (credenciales mal puestas, servicio caído, etc.),
    // no se debe dejar al votante sin código: se cae a modo demo y se
    // deja log claro del error para que el admin lo revise.
    console.error("[sms][CLARO] Error enviando SMS real, cayendo a modo demo:", err.message);
    console.log(`[sms][DEMO-FALLBACK] Código OTP para ${movil}: ${code}`);
    return { provider: "demo" };
  }
}

module.exports = { sendOtpSms };