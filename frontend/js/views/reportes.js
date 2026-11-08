import { api, qs, guardarBlob } from '../api.js';
import { esc, fmtDuracion, vacio, toast, conCarga } from '../ui.js';
import { crearGestor, graficoMeses, graficoPrioridades, graficoProgramadores, htmlIndicadores, etiquetaMes } from './graficos.js';

export async function montar(el) {
    const graficos = crearGestor();
    const hoy = new Date();
    const filtro = { desde: '', hasta: '' };

    el.innerHTML = `
        <div class="tarjeta mb-4">
            <div class="filtros">
                <div class="campo"><label for="r-desde">Desde</label><input type="date" class="form-control" id="r-desde"></div>
                <div class="campo"><label for="r-hasta">Hasta</label><input type="date" class="form-control" id="r-hasta"></div>
                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-light" data-rango="mes">Este mes</button>
                    <button class="btn btn-light" data-rango="anio">Este año</button>
                    <button class="btn btn-light" data-rango="todo">Todo</button>
                </div>
                <div class="ms-auto d-flex gap-2 flex-wrap">
                    <button class="btn btn-outline-success" data-exportar="xlsx"><i class="bi bi-file-earmark-excel"></i> Exportar Excel</button>
                    <button class="btn btn-outline-danger" data-exportar="pdf"><i class="bi bi-file-earmark-pdf"></i> Exportar PDF</button>
                </div>
            </div>
        </div>
        <div id="reporte"></div>`;

    const raiz = el.querySelector('#reporte');
    const desde = el.querySelector('#r-desde');
    const hasta = el.querySelector('#r-hasta');

    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const tabla = (titulo, icono, encabezados, filas) => `
        <div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi ${icono} text-primary"></i> ${titulo}</div>
        ${filas.length ? `<div class="table-responsive"><table class="table tabla">
            <thead><tr>${encabezados.map(([t, der]) => `<th class="${der ? 'text-end' : ''}">${t}</th>`).join('')}</tr></thead>
            <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td class="${encabezados[i][1] ? 'text-end' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>` : vacio('bi-table', 'Sin datos en este periodo')}</div>`;

    let solicitud = 0;
    async function cargar() {
        const mia = ++solicitud;
        raiz.innerHTML = '<div class="vacio"><div class="spinner-border text-primary"></div></div>';
        try {
            const r = await api(`/reportes/resumen${qs(filtro)}`);
            if (mia !== solicitud) return;
            graficos.limpiar();

            raiz.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-6 col-xl-3"><div class="tarjeta kpi"><div class="kpi-icono bg-primary-subtle text-primary"><i class="bi bi-ticket-detailed"></i></div>
                        <div><div class="kpi-valor">${r.totales.total}</div><div class="kpi-etiqueta">Total de incidentes</div></div></div></div>
                    <div class="col-6 col-xl-3"><div class="tarjeta kpi"><div class="kpi-icono bg-warning-subtle text-warning-emphasis"><i class="bi bi-folder2-open"></i></div>
                        <div><div class="kpi-valor">${r.totales.abiertos}</div><div class="kpi-etiqueta">Incidentes abiertos</div></div></div></div>
                    <div class="col-6 col-xl-3"><div class="tarjeta kpi"><div class="kpi-icono bg-secondary-subtle text-secondary"><i class="bi bi-lock-fill"></i></div>
                        <div><div class="kpi-valor">${r.totales.cerrados}</div><div class="kpi-etiqueta">Incidentes cerrados</div></div></div></div>
                    <div class="col-6 col-xl-3"><div class="tarjeta kpi"><div class="kpi-icono bg-success-subtle text-success"><i class="bi bi-check2-circle"></i></div>
                        <div><div class="kpi-valor">${r.totales.porEstado['Solucionado'] + r.totales.porEstado['Aprobado por Cliente'] + r.totales.porEstado['Cerrado']}</div><div class="kpi-etiqueta">Incidentes solucionados</div></div></div></div>
                    ${htmlIndicadores(r)}
                </div>

                <div class="row g-4 mb-4">
                    <div class="col-lg-6"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-flag text-primary"></i> Incidentes por prioridad</div>
                        <div class="tarjeta-cuerpo"><div class="grafico"><canvas id="g-prioridades"></canvas></div></div></div></div>
                    <div class="col-lg-6"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-calendar3 text-primary"></i> Incidentes por mes</div>
                        <div class="tarjeta-cuerpo"><div class="grafico">${r.porMes.length ? '<canvas id="g-meses"></canvas>' : vacio('bi-bar-chart', 'Sin datos en este periodo')}</div></div></div></div>
                </div>

                <div class="row g-4 mb-4">
                    <div class="col-lg-6">${tabla('Incidentes por cliente', 'bi-buildings', [['Cliente'], ['Total', 1], ['Abiertos', 1]],
                        r.porCliente.map(c => [`${esc(c.razon_social)}<br><small class="text-muted">${esc(c.ruc)}</small>`, c.total, c.abiertos]))}</div>
                    <div class="col-lg-6">${tabla('Productividad por programador', 'bi-person-workspace', [['Programador'], ['Asignados', 1], ['Solucionados', 1], ['T. prom. solución', 1]],
                        r.porProgramador.map(p => [esc(p.programador), p.asignados, p.solucionados, fmtDuracion(p.t_solucion)]))}</div>
                </div>

                <div class="row g-4">
                    <div class="col-lg-6">${tabla('Incidentes por mes', 'bi-calendar-month', [['Mes'], ['Registrados', 1], ['Atendidos', 1]],
                        r.porMes.map(m => [etiquetaMes(m.mes), m.creados, m.atendidos]))}</div>
                    <div class="col-lg-6"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-people text-primary"></i> Carga por programador</div>
                        <div class="tarjeta-cuerpo"><div class="grafico">${r.porProgramador.length ? '<canvas id="g-programadores"></canvas>' : vacio('bi-people', 'Sin datos en este periodo')}</div></div></div></div>
                </div>`;

            graficos.crear(raiz.querySelector('#g-prioridades'), graficoPrioridades(r.porPrioridad));
            if (raiz.querySelector('#g-meses')) graficos.crear(raiz.querySelector('#g-meses'), graficoMeses(r.porMes));
            if (raiz.querySelector('#g-programadores')) graficos.crear(raiz.querySelector('#g-programadores'), graficoProgramadores(r.porProgramador));
        } catch (err) {
            if (mia === solicitud) raiz.innerHTML = vacio('bi-exclamation-triangle', 'No se pudo generar el reporte', err.message);
        }
    }

    function aplicar(d, h) {
        filtro.desde = d;
        filtro.hasta = h;
        desde.value = d;
        hasta.value = h;
        cargar();
    }

    desde.addEventListener('change', () => aplicar(desde.value, hasta.value));
    hasta.addEventListener('change', () => aplicar(desde.value, hasta.value));

    el.addEventListener('click', async e => {
        const rango = e.target.closest('[data-rango]')?.dataset.rango;
        if (rango === 'mes') aplicar(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), iso(hoy));
        if (rango === 'anio') aplicar(iso(new Date(hoy.getFullYear(), 0, 1)), iso(hoy));
        if (rango === 'todo') aplicar('', '');

        const boton = e.target.closest('[data-exportar]');
        if (boton) {
            const formato = boton.dataset.exportar;
            await conCarga(boton, async () => {
                try {
                    const blob = await api(`/reportes/exportar${qs({ ...filtro, formato })}`, { blob: true });
                    guardarBlob(blob, `reporte-incidentes-${iso(hoy)}.${formato}`);
                    toast(`Reporte ${formato.toUpperCase()} generado`);
                } catch (err) {
                    toast(err.message, 'error');
                }
            });
        }
    });

    await cargar();
    return () => graficos.limpiar();
}
