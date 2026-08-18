/* =========================================================================
   importar-censo.js — Importa el censo de votantes desde un Excel a la
   base de datos (tabla `voters`).

   USO:
     1. Instala la dependencia (una sola vez, dentro de la carpeta server/):
          npm install xlsx

     2. Coloca el Excel en server/ (o dale la ruta completa) y corre:
          node importar-censo.js ruta/al/censo.xlsx

   FORMATO ESPERADO DEL EXCEL:
     Una sola hoja, con estas columnas (el orden no importa, pero los
     NOMBRES de encabezado sí — deben coincidir exactamente, sin tildes
     ni mayúsculas raras):

       cedula | nombre | zona | movil

     Ejemplo de fila:
       12345678 | Carlos Andrés Perdomo Losada | Zona Neiva | 3112223344

   QUÉ HACE:
     - Lee el Excel.
     - Valida cada fila (cédula, nombre, zona conocida, móvil de 10
       dígitos que empiece en 3).
     - Si TODO el archivo es válido, inserta todo en una sola transacción.
     - Si hay errores, NO inserta nada — te imprime un reporte fila por
       fila para que corrijas el Excel y vuelvas a intentar.
     - Las cédulas que ya existan en la base de datos se OMITEN (no se
       duplican, no se sobreescriben) — se listan aparte en el reporte.
   ========================================================================= */

const path = require("path");
const XLSX = require("xlsx");
const { db, DEFAULT_ZONES } = require("./db"); // ajusta la ruta si este script no queda junto a db.js

const ZONAS_VALIDAS = new Set(DEFAULT_ZONES);

function normalizarEncabezado(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // quita tildes
}

function validarFila(row, idx) {
    const errores = [];

    const cedula = String(row.cedula ?? "").trim();
    const nombre = String(row.nombre ?? "").trim();
    const zona = String(row.zona ?? "").trim();
    const movilRaw = String(row.movil ?? "").trim();
    const movil = movilRaw.replace(/\D/g, ""); // solo dígitos

    if (!cedula) errores.push("cédula vacía");
    if (!nombre) errores.push("nombre vacío");
    if (!zona) {
        errores.push("zona vacía");
    } else if (!ZONAS_VALIDAS.has(zona)) {
        errores.push(
            `zona "${zona}" no reconocida (válidas: ${[...ZONAS_VALIDAS].join(", ")})`
        );
    }
    if (!/^3\d{9}$/.test(movil)) {
        errores.push(`móvil inválido "${movilRaw}" (se esperan 10 dígitos empezando en 3)`);
    }

    return {
        fila: idx + 2, // +2: fila 1 es encabezado, y los índices de Excel empiezan en 1
        cedula,
        nombre,
        zona,
        movil,
        errores,
    };
}

function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("Uso: node importar-censo.js ruta/al/censo.xlsx");
        process.exit(1);
    }

    const wb = XLSX.readFile(path.resolve(filePath));
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    // defval: "" evita que openpyxl/xlsx omita celdas vacías del objeto
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rawRows.length === 0) {
        console.error("El Excel no tiene filas de datos (¿hoja vacía o encabezados mal escritos?).");
        process.exit(1);
    }

    // Normaliza claves de cada fila (por si el Excel viene con "Cédula", "CEDULA", etc.)
    const rows = rawRows.map((raw) => {
        const clean = {};
        Object.entries(raw).forEach(([k, v]) => {
            clean[normalizarEncabezado(k)] = v;
        });
        return clean;
    });

    const validadas = rows.map(validarFila);
    const conError = validadas.filter((r) => r.errores.length > 0);
    const cedulasVistas = new Set();
    const duplicadosEnArchivo = [];

    validadas.forEach((r) => {
        if (r.errores.length === 0) {
            if (cedulasVistas.has(r.cedula)) {
                duplicadosEnArchivo.push(r.fila);
            }
            cedulasVistas.add(r.cedula);
        }
    });

    if (conError.length > 0) {
        console.error(`\n❌ Se encontraron ${conError.length} fila(s) con errores. No se importó nada.\n`);
        conError.forEach((r) => {
            console.error(`  Fila ${r.fila} (cédula "${r.cedula}"): ${r.errores.join("; ")}`);
        });
        console.error("\nCorrige el Excel y vuelve a correr el script.");
        process.exit(1);
    }

    if (duplicadosEnArchivo.length > 0) {
        console.error(`\n❌ Cédulas repetidas DENTRO del mismo archivo, en las filas: ${duplicadosEnArchivo.join(", ")}. No se importó nada.\n`);
        process.exit(1);
    }

    // Filtra las que ya existen en la BD
    const yaExiste = db.prepare("SELECT 1 FROM voters WHERE cedula = ?");
    const nuevas = [];
    const omitidas = [];

    validadas.forEach((r) => {
        if (yaExiste.get(r.cedula)) {
            omitidas.push(r.cedula);
        } else {
            nuevas.push(r);
        }
    });

    if (nuevas.length === 0) {
        console.log("\n⚠️  Todas las cédulas del archivo ya existían en la base de datos. No se insertó nada nuevo.");
        if (omitidas.length) console.log(`Cédulas ya existentes: ${omitidas.join(", ")}`);
        process.exit(0);
    }

    const insertar = db.prepare(
        "INSERT INTO voters (cedula, nombre, movil, zona, voted) VALUES (?, ?, ?, ?, 0)"
    );
    const tx = db.transaction((filas) => {
        filas.forEach((r) => insertar.run(r.cedula, r.nombre, r.movil, r.zona));
    });
    tx(nuevas);

    console.log(`\n✅ Importación completa: ${nuevas.length} votante(s) nuevo(s) insertado(s).`);
    if (omitidas.length > 0) {
        console.log(`ℹ️  ${omitidas.length} cédula(s) ya existían y se omitieron: ${omitidas.join(", ")}`);
    }
}

main();