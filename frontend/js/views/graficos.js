// Gráficos compartidos por el dashboard y los reportes (Chart.js)
import { esc, fmtDuracion } from '../ui.js';

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.color = '#64748b';

export const COLORES_PRIORIDAD = {
    'Muy Urgente': '#dc2626',
    'Urgente': '#ea580c',
    'No Muy Urgente': '#eab308',
    'Largo Plazo': '#2563eb'
};
export const COLORES_ESTADO = {
    'Pendiente': '#f59e0b',
    'En Atención': '#3b82f6',
    'Solucionado': '#14b8a6',
    'Aprobado por Cliente': '#22c55e',
    'Cerrado': '#94a3b8'
};

const NOMBRES_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const etiquetaMes = mes => {
    const [anio, m] = mes.split('-');
    return `${NOMBRES_MES[Number(m) - 1]} ${anio.slice(2)}`;
};

// Mantiene los gráficos de una vista para destruirlos al salir o al repintar
export function crearGestor() {
    const activos = [];
    return {
        crear(canvas, config) {
            const g = new Chart(canvas, config);
            activos.push(g);
            return g;
        },
        limpiar() { activos.splice(0).forEach(g => g.destroy()); }
    };
}

export const graficoMeses = (porMes) => ({
    type: 'bar',
    data: {
        labels: porMes.map(m => etiquetaMes(m.mes)),
        datasets: [
            { label: 'Registrados', data: porMes.map(m => m.creados), backgroundColor: '#93c5fd', borderRadius: 6 },
            { label: 'Atendidos', data: porMes.map(m => m.atendidos), backgroundColor: '#2563eb', borderRadius: 6 }
        ]
    },
    options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
    }
});

export const graficoEstados = (porEstado) => ({
    type: 'doughnut',
    data: {
        labels: Object.keys(porEstado),
        datasets: [{ data: Object.values(porEstado), backgroundColor: Object.keys(porEstado).map(e => COLORES_ESTADO[e]), borderWidth: 2 }]
    },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } }
});

export const graficoPrioridades = (porPrioridad) => ({
    type: 'bar',
    data: {
        labels: porPrioridad.map(p => p.prioridad),
        datasets: [
            { label: 'Total', data: porPrioridad.map(p => p.total), backgroundColor: porPrioridad.map(p => COLORES_PRIORIDAD[p.prioridad] + '66'), borderRadius: 6 },
            { label: 'Abiertos', data: porPrioridad.map(p => p.abiertos), backgroundColor: porPrioridad.map(p => COLORES_PRIORIDAD[p.prioridad]), borderRadius: 6 }
        ]
    },
    options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
    }
});

export const graficoProgramadores = (porProgramador) => ({
    type: 'bar',
    data: {
        labels: porProgramador.map(p => p.programador),
        datasets: [
            { label: 'Abiertos', data: porProgramador.map(p => p.abiertos), backgroundColor: '#f59e0b', borderRadius: 6 },
            { label: 'Solucionados', data: porProgramador.map(p => p.solucionados), backgroundColor: '#22c55e', borderRadius: 6 }
        ]
    },
    options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
    }
});

// Tarjetas de indicadores de tiempos y SLA
export function htmlIndicadores(r) {
    const sla = r.sla.porcentaje;
    const clasesSla = sla === null ? 'bg-secondary-subtle text-secondary' : sla >= 90 ? 'bg-success-subtle text-success' : sla >= 70 ? 'bg-warning-subtle text-warning-emphasis' : 'bg-danger-subtle text-danger';
    const tarjeta = (icono, clases, valor, etiqueta, detalle = '') => `
        <div class="col-6 col-xl-3"><div class="tarjeta kpi">
            <div class="kpi-icono ${clases}"><i class="bi ${icono}"></i></div>
            <div><div class="kpi-valor">${valor}</div><div class="kpi-etiqueta">${etiqueta}</div>${detalle ? `<div class="kpi-etiqueta">${detalle}</div>` : ''}</div>
        </div></div>`;
    return `
        ${tarjeta('bi-hourglass-split', 'bg-primary-subtle text-primary', fmtDuracion(r.tiempos.atencion), 'Tiempo prom. de respuesta')}
        ${tarjeta('bi-stopwatch', 'bg-info-subtle text-info-emphasis', fmtDuracion(r.tiempos.solucion), 'Tiempo prom. de solución')}
        ${tarjeta('bi-shield-check', clasesSla, sla === null ? '—' : `${sla}%`, 'Cumplimiento de SLA', `${r.sla.cumplidos} de ${r.sla.cumplidos + r.sla.incumplidos} en plazo`)}
        ${tarjeta('bi-star-fill', 'bg-warning-subtle text-warning-emphasis', r.satisfaccion.promedio === null ? '—' : r.satisfaccion.promedio.toFixed(1), 'Satisfacción (1-5)', `${r.satisfaccion.total} valoraciones`)}`;
}

export const celdaNombre = (nombre, detalle) => `${esc(nombre)}${detalle ? `<br><small class="text-muted">${esc(detalle)}</small>` : ''}`;
