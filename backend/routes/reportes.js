const router = require('express').Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { error } = require('../lib/http');
const { auditar } = require('../lib/audit');
const { resumen, detalle, duracion } = require('../lib/reportes');
const { autenticar, soloStaff } = require('../middleware/auth');

router.use(autenticar, soloStaff);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function rango(req) {
    const { desde, hasta } = req.query;
    if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) throw error(400, 'Rango de fechas no válido');
    return { desde, hasta };
}

const fmtFecha = f => (f ? new Date(f).toLocaleDateString('es-PE') : '');
const fmtFechaHora = f => (f ? new Date(f).toLocaleString('es-PE', { hour12: false }) : '');
const periodo = ({ desde, hasta }) => (desde || hasta ? `${desde || 'inicio'} al ${hasta || 'hoy'}` : 'Todo el historial');

router.get('/resumen', async (req, res) => {
    res.json(await resumen(rango(req)));
});

router.get('/exportar', async (req, res) => {
    const formato = req.query.formato;
    if (!['xlsx', 'pdf'].includes(formato)) throw error(400, 'Formato no válido');
    const filtro = rango(req);
    const [datos, incidentes] = await Promise.all([resumen(filtro), detalle(filtro)]);
    const nombre = `reporte-incidentes-${new Date().toISOString().slice(0, 10)}`;

    await auditar(req.user, 'exportar_reporte', 'reporte', null, `${formato.toUpperCase()} · ${periodo(filtro)}`, req.ip);

    if (formato === 'xlsx') return exportarExcel(res, nombre, filtro, datos, incidentes);
    return exportarPdf(res, nombre, filtro, datos, incidentes);
});

async function exportarExcel(res, nombre, filtro, datos, incidentes) {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Mesa de Ayuda';
    libro.created = new Date();

    const hoja = (titulo, columnas, filas) => {
        const h = libro.addWorksheet(titulo);
        h.columns = columnas.map(([header, key, width]) => ({ header, key, width }));
        h.addRows(filas);
        h.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        h.views = [{ state: 'frozen', ySplit: 1 }];
        return h;
    };

    hoja('Resumen', [['Indicador', 'k', 38], ['Valor', 'v', 28]], [
        { k: 'Periodo', v: periodo(filtro) },
        { k: 'Total de incidentes', v: datos.totales.total },
        { k: 'Incidentes abiertos', v: datos.totales.abiertos },
        { k: 'Incidentes cerrados', v: datos.totales.cerrados },
        ...Object.entries(datos.totales.porEstado).map(([e, t]) => ({ k: `Estado: ${e}`, v: t })),
        { k: 'Tiempo promedio de atención', v: duracion(datos.tiempos.atencion) },
        { k: 'Tiempo promedio de solución', v: duracion(datos.tiempos.solucion) },
        { k: 'Cumplimiento de SLA', v: datos.sla.porcentaje === null ? '—' : `${datos.sla.porcentaje}%` },
        { k: 'Satisfacción promedio (1-5)', v: datos.satisfaccion.promedio === null ? '—' : Number(datos.satisfaccion.promedio.toFixed(2)) }
    ]);
    hoja('Por prioridad', [['Prioridad', 'prioridad', 20], ['SLA (horas)', 'sla_horas', 14], ['Total', 'total', 12], ['Abiertos', 'abiertos', 12]], datos.porPrioridad);
    hoja('Por cliente', [['Razón social', 'razon_social', 40], ['RUC', 'ruc', 16], ['Total', 'total', 12], ['Abiertos', 'abiertos', 12]], datos.porCliente);
    hoja('Por programador', [['Programador', 'programador', 30], ['Asignados', 'asignados', 12], ['Abiertos', 'abiertos', 12], ['Solucionados', 'solucionados', 14], ['Tiempo prom. solución', 't', 22]],
        datos.porProgramador.map(p => ({ ...p, t: duracion(p.t_solucion) })));
    hoja('Por mes', [['Mes', 'mes', 14], ['Registrados', 'creados', 14], ['Atendidos', 'atendidos', 14]], datos.porMes);
    hoja('Incidentes', [
        ['Ticket', 'numero_ticket', 18], ['Fecha registro', 'f1', 20], ['Cliente', 'cliente', 36], ['RUC', 'ruc', 14], ['Tipo', 'tipo', 20],
        ['Prioridad', 'prioridad', 16], ['Asunto', 'asunto', 44], ['Estado', 'estado', 22], ['Programador', 'programador', 22],
        ['Fecha atención', 'f2', 20], ['Fecha solución', 'f3', 20], ['Fecha aprobación', 'f4', 20], ['T. atención', 't1', 14], ['T. solución', 't2', 14]
    ], incidentes.map(i => ({
        ...i,
        f1: fmtFechaHora(i.fecha_registro), f2: fmtFechaHora(i.fecha_atencion), f3: fmtFechaHora(i.fecha_solucion), f4: fmtFechaHora(i.fecha_aprobacion),
        t1: duracion(i.t_atencion), t2: duracion(i.t_solucion)
    }))).autoFilter = { from: 'A1', to: 'N1' };

    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}.xlsx"`
    });
    await libro.xlsx.write(res);
    res.end();
}

function exportarPdf(res, nombre, filtro, datos, incidentes) {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}.pdf"` });
    doc.pipe(res);

    const AZUL = '#1f4e79';
    const ancho = doc.page.width - 80;

    const titulo = texto => {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(AZUL).text(texto).moveDown(0.3).fillColor('#000');
    };

    // Tabla simple: columnas = [[encabezado, ancho relativo, alineación]]
    const tabla = (columnas, filas) => {
        const total = columnas.reduce((s, c) => s + c[1], 0);
        const anchos = columnas.map(c => (c[1] / total) * ancho);
        const alto = 16;
        const dibujarFila = (celdas, cabecera) => {
            if (doc.y > doc.page.height - 60) doc.addPage();
            const y = doc.y;
            if (cabecera) doc.rect(40, y - 2, ancho, alto).fill(AZUL).fillColor('#fff');
            else doc.fillColor('#000');
            let x = 40;
            celdas.forEach((c, i) => {
                doc.font(cabecera ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
                    .text(String(c ?? ''), x + 3, y + 2, { width: anchos[i] - 6, height: alto - 2, ellipsis: true, lineBreak: false, align: columnas[i][2] || 'left' });
                x += anchos[i];
            });
            doc.fillColor('#000').y = y + alto;
        };
        dibujarFila(columnas.map(c => c[0]), true);
        if (!filas.length) dibujarFila(['Sin datos'], false);
        filas.forEach(f => dibujarFila(f, false));
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor(AZUL).text('Reporte de Incidentes');
    doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text(`Periodo: ${periodo(filtro)}   ·   Generado: ${fmtFechaHora(new Date())}   ·   Por: ${res.req.user.nombre}`).fillColor('#000');

    titulo('Resumen general');
    tabla([['Indicador', 3], ['Valor', 2]], [
        ['Total de incidentes', datos.totales.total],
        ['Abiertos', datos.totales.abiertos],
        ['Cerrados', datos.totales.cerrados],
        ['Tiempo promedio de atención', duracion(datos.tiempos.atencion)],
        ['Tiempo promedio de solución', duracion(datos.tiempos.solucion)],
        ['Cumplimiento de SLA', datos.sla.porcentaje === null ? '—' : `${datos.sla.porcentaje}%`],
        ['Satisfacción promedio', datos.satisfaccion.promedio === null ? '—' : `${datos.satisfaccion.promedio.toFixed(1)} / 5 (${datos.satisfaccion.total} respuestas)`]
    ]);

    titulo('Incidentes por estado');
    tabla([['Estado', 3], ['Total', 1, 'right']], Object.entries(datos.totales.porEstado));

    titulo('Incidentes por prioridad');
    tabla([['Prioridad', 3], ['SLA', 1], ['Total', 1, 'right'], ['Abiertos', 1, 'right']],
        datos.porPrioridad.map(p => [p.prioridad, `${p.sla_horas} h`, p.total, p.abiertos]));

    titulo('Incidentes por programador');
    tabla([['Programador', 3], ['Asignados', 1, 'right'], ['Abiertos', 1, 'right'], ['Solucionados', 1, 'right'], ['T. prom. solución', 2, 'right']],
        datos.porProgramador.map(p => [p.programador, p.asignados, p.abiertos, p.solucionados, duracion(p.t_solucion)]));

    titulo('Incidentes por mes');
    tabla([['Mes', 2], ['Registrados', 1, 'right'], ['Atendidos', 1, 'right']], datos.porMes.map(m => [m.mes, m.creados, m.atendidos]));

    titulo('Incidentes por cliente');
    tabla([['Cliente', 4], ['RUC', 2], ['Total', 1, 'right'], ['Abiertos', 1, 'right']],
        datos.porCliente.map(c => [c.razon_social, c.ruc, c.total, c.abiertos]));

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(AZUL).text('Detalle de incidentes').moveDown(0.3).fillColor('#000');
    tabla([['Ticket', 2.2], ['Fecha', 1.5], ['Cliente', 3], ['Prioridad', 1.8], ['Estado', 2.2], ['Programador', 2], ['T. solución', 1.4, 'right']],
        incidentes.map(i => [i.numero_ticket, fmtFecha(i.fecha_registro), i.cliente, i.prioridad, i.estado, i.programador || '—', duracion(i.t_solucion)]));

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(8).fillColor('#888')
            .text(`Página ${i + 1} de ${paginas.count}`, 40, doc.page.height - 30, { width: ancho, align: 'center', lineBreak: false });
    }
    doc.end();
}

module.exports = router;
