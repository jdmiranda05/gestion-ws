import { api } from '../api.js';
import { usuario, alEvento, navegar } from '../estado.js';
import { esc, fmtFecha, fmtHora, badgePrioridad, badgeEstado, badgeSla, vacio, debounce } from '../ui.js';
import { crearGestor, graficoMeses, graficoEstados, graficoProgramadores, htmlIndicadores, COLORES_PRIORIDAD } from './graficos.js';

const KPIS_PRIORIDAD = {
    'Muy Urgente': 'bi-exclamation-octagon-fill',
    'Urgente': 'bi-exclamation-triangle-fill',
    'No Muy Urgente': 'bi-info-circle-fill',
    'Largo Plazo': 'bi-calendar-event-fill'
};

export async function montar(el) {
    const graficos = crearGestor();

    el.innerHTML = `
        <div class="mb-4">
            <h2 class="h5 fw-bold mb-0" id="saludo"></h2>
            <p class="text-muted mb-0">Resumen de la atención de incidentes.</p>
        </div>
        <div id="contenido-dashboard"></div>`;
    const raiz = el.querySelector('#contenido-dashboard');
    const hora = new Date().getHours();
    el.querySelector('#saludo').textContent = `${hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${usuario.nombre.split(' ')[0]}`;

    const enlace = (consulta) => `#/incidentes?${new URLSearchParams(consulta)}`;

    async function cargar() {
        const [r, urgentes] = await Promise.all([
            api('/reportes/resumen'),
            api('/incidentes?abiertos=1&limit=8')
        ]);
        graficos.limpiar();
        const e = r.totales.porEstado;

        const kpiPrioridad = r.porPrioridad.map(p => `
            <div class="col-6 col-xl-3"><a class="tarjeta kpi" href="${enlace({ prioridad: p.prioridad, estado: 'abiertos' })}">
                <div class="kpi-icono" style="background:${COLORES_PRIORIDAD[p.prioridad]}1f;color:${COLORES_PRIORIDAD[p.prioridad]}"><i class="bi ${KPIS_PRIORIDAD[p.prioridad]}"></i></div>
                <div><div class="kpi-valor">${p.abiertos}</div><div class="kpi-etiqueta">${esc(p.prioridad)}</div><div class="kpi-etiqueta">SLA ${p.sla_horas} h</div></div>
            </a></div>`).join('');

        const kpiEstado = [
            ['Pendiente', 'Pendientes', 'bi-hourglass', 'bg-warning-subtle text-warning-emphasis'],
            ['En Atención', 'En atención', 'bi-gear-wide-connected', 'bg-primary-subtle text-primary'],
            ['Solucionado', 'Solucionados', 'bi-check2-circle', 'bg-success-subtle text-success'],
            ['Cerrado', 'Cerrados', 'bi-lock-fill', 'bg-secondary-subtle text-secondary']
        ].map(([estado, etiqueta, icono, clases]) => `
            <div class="col-6 col-xl-3"><a class="tarjeta kpi" href="${enlace({ estado })}">
                <div class="kpi-icono ${clases}"><i class="bi ${icono}"></i></div>
                <div><div class="kpi-valor">${e[estado]}</div><div class="kpi-etiqueta">${etiqueta}</div></div>
            </a></div>`).join('');

        raiz.innerHTML = `
            <h3 class="h6 fw-bold text-muted text-uppercase mb-2">Incidentes abiertos por prioridad</h3>
            <div class="row g-3 mb-4">${kpiPrioridad}</div>

            <h3 class="h6 fw-bold text-muted text-uppercase mb-2">Estado de la atención</h3>
            <div class="row g-3 mb-4">${kpiEstado}</div>

            <h3 class="h6 fw-bold text-muted text-uppercase mb-2">Indicadores</h3>
            <div class="row g-3 mb-4">${htmlIndicadores(r)}</div>

            <div class="row g-4 mb-4">
                <div class="col-lg-7"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-graph-up text-primary"></i> Incidentes atendidos por mes</div>
                    <div class="tarjeta-cuerpo"><div class="grafico">${r.porMes.length ? '<canvas id="g-meses"></canvas>' : vacio('bi-bar-chart', 'Aún no hay datos')}</div></div></div></div>
                <div class="col-lg-5"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-pie-chart text-primary"></i> Incidentes por estado</div>
                    <div class="tarjeta-cuerpo"><div class="grafico">${r.totales.total ? '<canvas id="g-estados"></canvas>' : vacio('bi-pie-chart', 'Aún no hay datos')}</div></div></div></div>
            </div>

            <div class="row g-4">
                <div class="col-lg-7"><div class="tarjeta h-100">
                    <div class="tarjeta-cabecera"><i class="bi bi-lightning-charge text-primary"></i> Requieren atención
                        <a href="#/incidentes?estado=abiertos" class="ms-auto small fw-normal">Ver todos</a></div>
                    ${urgentes.datos.length ? `<div class="table-responsive"><table class="table tabla"><tbody>${urgentes.datos.map(i => `
                        <tr class="fila-click" data-id="${i.id}">
                            <td><span class="ticket-num">${esc(i.numero_ticket)}</span><br><small class="text-muted">${fmtFecha(i.fecha_registro)} ${fmtHora(i.fecha_registro)}</small></td>
                            <td><div class="celda-asunto" style="max-width:220px">${esc(i.asunto)}</div><small class="text-muted">${esc(i.cliente)}</small></td>
                            <td>${badgePrioridad(i.prioridad)}</td>
                            <td>${badgeEstado(i.estado)}<br>${badgeSla(i.sla)}</td>
                        </tr>`).join('')}</tbody></table></div>` : vacio('bi-emoji-smile', '¡Todo al día!', 'No hay incidentes abiertos.')}
                </div></div>
                <div class="col-lg-5"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-people text-primary"></i> Carga por programador</div>
                    <div class="tarjeta-cuerpo"><div class="grafico">${r.porProgramador.length ? '<canvas id="g-programadores"></canvas>' : vacio('bi-people', 'Aún no hay datos')}</div></div></div></div>
            </div>`;

        const canvas = id => raiz.querySelector(id);
        if (canvas('#g-meses')) graficos.crear(canvas('#g-meses'), graficoMeses(r.porMes));
        if (canvas('#g-estados')) graficos.crear(canvas('#g-estados'), graficoEstados(e));
        if (canvas('#g-programadores')) graficos.crear(canvas('#g-programadores'), graficoProgramadores(r.porProgramador));
    }

    raiz.addEventListener('click', ev => {
        const fila = ev.target.closest('tr[data-id]');
        if (fila) navegar(`/incidentes/${fila.dataset.id}`);
    });

    const refrescar = debounce(() => cargar().catch(() => {}), 1000);
    const bajas = [alEvento('incidente:cambio', refrescar), alEvento('reconectado', refrescar)];

    await cargar();
    return () => { bajas.forEach(b => b()); graficos.limpiar(); };
}
