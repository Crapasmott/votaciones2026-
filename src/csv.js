/* =========================================================================
   csv.js — parser CSV mínimo, sin dependencias externas.
   Soporta comillas dobles, comas dentro de campos citados y comillas
   escapadas (""). Pensado para la plantilla de importación de votantes:
   cedula,nombre,movil,zona
   ========================================================================= */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // ignorar, \n se encarga del salto de línea
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  // última fila si el archivo no termina en salto de línea
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Convierte texto CSV con encabezado (cedula,nombre,movil,zona) en un
 * arreglo de objetos { cedula, nombre, movil, zona }.
 */
export function parseVotersCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    cedula: header.indexOf("cedula"),
    nombre: header.indexOf("nombre"),
    movil: header.indexOf("movil"),
    zona: header.indexOf("zona"),
  };

  const dataRows = rows.slice(1);
  return dataRows.map((r) => ({
    cedula: idx.cedula >= 0 ? (r[idx.cedula] || "").trim() : "",
    nombre: idx.nombre >= 0 ? (r[idx.nombre] || "").trim() : "",
    movil: idx.movil >= 0 ? (r[idx.movil] || "").trim() : "",
    zona: idx.zona >= 0 ? (r[idx.zona] || "").trim() : "",
  }));
}

export const VOTERS_CSV_TEMPLATE =
  "cedula,nombre,movil,zona\n" +
  "12345678,Nombre Completo Ejemplo,3001112233,Zona Neiva\n";

export function downloadVotersCsvTemplate() {
  const blob = new Blob([VOTERS_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_votantes.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
