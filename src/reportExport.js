/* =========================================================================
   reportExport.js — genera y descarga el reporte final en Excel (.xlsx)
   y PDF a partir de los datos que devuelve GET /api/admin/report.
   ========================================================================= */

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportReportToExcel(report) {
  const wb = XLSX.utils.book_new();

  const resumenData = [
    ["Reporte final de votación — COCOLAB · ElectroHuila"],
    [],
    ["Votantes habilitados", report.totalVoters],
    ["Total votos emitidos", report.totalVoted],
    ["Participación global (%)", report.participacionGeneral],
    [],
    ["Zona", "Votantes", "Votaron", "Participación (%)", "Ganador"],
    ...report.porZona.map((r) => [
      r.zona,
      r.totalVotantes,
      r.totalVotaron,
      r.participacion,
      r.ganador?.nombre || "—",
    ]),
  ];
  const resumenSheet = XLSX.utils.aoa_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(wb, resumenSheet, "Resumen");

  report.porZona.forEach((r) => {
    const rows = [
      ["Candidato", "Votos"],
      ...r.candidatos.map((c) => [c.nombre, c.votos]),
      ["Total zona", r.candidatos.reduce((a, c) => a + c.votos, 0)],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    // Los nombres de hoja en Excel no admiten \ / * ? : [ ] y máximo 31 caracteres.
    const safeName = r.zona.replace(/[\\/*?:[\]]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, sheet, safeName);
  });

  XLSX.writeFile(wb, `reporte_votacion_cocolab_${Date.now()}.xlsx`);
}

export function exportReportToPdf(report) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Reporte final — Votación COCOLAB", 14, 18);

  doc.setFontSize(11);
  doc.text(`Votantes habilitados: ${report.totalVoters}`, 14, 28);
  doc.text(`Total votos emitidos: ${report.totalVoted}`, 14, 34);
  doc.text(`Participación global: ${report.participacionGeneral}%`, 14, 40);

  let y = 50;
  report.porZona.forEach((r) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(13);
    doc.text(`${r.zona} — Ganador: ${r.ganador?.nombre || "—"}`, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Candidato", "Votos"]],
      body: r.candidatos.map((c) => [c.nombre, String(c.votos)]),
      styles: { fontSize: 10 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;
  });

  doc.save(`reporte_votacion_cocolab_${Date.now()}.pdf`);
}