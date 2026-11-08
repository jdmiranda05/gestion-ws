const { query } = require('../db');
const { PRIORIDADES, ESTADOS } = require('../config');

const REGISTRADO = 'i.fecha_registro';

function condiciones({ desde, hasta }) {
    const filtros = [];
    const params = [];
    if (desde) {
        filtros.push(`${REGISTRADO} >= ?`);
        params.push(new Date(`${desde}T00:00:00`));
    }
    if (hasta) {
        filtros.push(`${REGISTRADO} <= ?`);
        params.push(new Date(`${hasta}T23:59:59`));
    }
    return { where: filtros.length ? `WHERE ${filtros.join(' AND ')}` : '', params };
}

const num = valor => (valor === null || valor === undefined ? null : Number(valor));

// Indicadores del dashboard y de los reportes (tiempos en segundos)
async function resumen(rango) {
    const { where, params } = condiciones(rango);
    const ahora = new Date();

    const [totales] = await query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(i.estado <> 'Cerrado'), 0) AS abiertos,
                COALESCE(SUM(i.estado = 'Cerrado'), 0) AS cerrados,
                AVG(TIMESTAMPDIFF(SECOND, i.fecha_registro, i.fecha_atencion)) AS t_atencion,
                AVG(TIMESTAMPDIFF(SECOND, i.fecha_registro, i.fecha_solucion)) AS t_solucion,
                COALESCE(SUM(i.fecha_atencion IS NOT NULL AND i.fecha_atencion <= i.sla_limite), 0) AS sla_cumplidos,
                COALESCE(SUM((i.fecha_atencion IS NOT NULL AND i.fecha_atencion > i.sla_limite)
                          OR (i.fecha_atencion IS NULL AND i.sla_limite < ?)), 0) AS sla_incumplidos
         FROM incidentes i ${where}`,
        [ahora, ...params]
    );

    const porEstadoFilas = await query(`SELECT i.estado, COUNT(*) AS total FROM incidentes i ${where} GROUP BY i.estado`, params);
    const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]));
    porEstadoFilas.forEach(f => { porEstado[f.estado] = Number(f.total); });

    const porPrioridadFilas = await query(
        `SELECT i.prioridad, COUNT(*) AS total, SUM(i.estado <> 'Cerrado') AS abiertos
         FROM incidentes i ${where} GROUP BY i.prioridad`,
        params
    );
    const porPrioridad = PRIORIDADES.map(p => {
        const f = porPrioridadFilas.find(x => x.prioridad === p.nombre);
        return { prioridad: p.nombre, sla_horas: p.slaHoras, total: Number(f?.total || 0), abiertos: Number(f?.abiertos || 0) };
    });

    const porCliente = (await query(
        `SELECT c.razon_social, c.ruc, COUNT(*) AS total, SUM(i.estado <> 'Cerrado') AS abiertos
         FROM incidentes i JOIN clientes c ON c.id_cliente = i.id_cliente ${where}
         GROUP BY c.id_cliente, c.razon_social, c.ruc ORDER BY total DESC, c.razon_social`,
        params
    )).map(f => ({ ...f, total: Number(f.total), abiertos: Number(f.abiertos) }));

    const porProgramador = (await query(
        `SELECT COALESCE(s.nombre, 'Sin asignar') AS programador,
                COUNT(*) AS asignados,
                SUM(i.estado <> 'Cerrado') AS abiertos,
                SUM(i.fecha_solucion IS NOT NULL) AS solucionados,
                AVG(TIMESTAMPDIFF(SECOND, i.fecha_registro, i.fecha_solucion)) AS t_solucion
         FROM incidentes i LEFT JOIN staff s ON s.id_usuario = i.id_programador ${where}
         GROUP BY i.id_programador, s.nombre ORDER BY asignados DESC`,
        params
    )).map(f => ({
        programador: f.programador,
        asignados: Number(f.asignados),
        abiertos: Number(f.abiertos),
        solucionados: Number(f.solucionados),
        t_solucion: num(f.t_solucion)
    }));

    const creados = await query(
        `SELECT DATE_FORMAT(i.fecha_registro, '%Y-%m') AS mes, COUNT(*) AS total FROM incidentes i ${where} GROUP BY mes`, params
    );
    const atendidos = await query(
        `SELECT DATE_FORMAT(i.fecha_atencion, '%Y-%m') AS mes, COUNT(*) AS total FROM incidentes i
         ${where ? `${where} AND` : 'WHERE'} i.fecha_atencion IS NOT NULL GROUP BY mes`, params
    );
    const meses = [...new Set([...creados, ...atendidos].map(f => f.mes))].sort();
    const porMes = meses.map(mes => ({
        mes,
        creados: Number(creados.find(f => f.mes === mes)?.total || 0),
        atendidos: Number(atendidos.find(f => f.mes === mes)?.total || 0)
    }));

    const { where: whereEncuesta, params: paramsEncuesta } = condiciones(rango);
    const [satisfaccion] = await query(
        `SELECT AVG(e.calificacion) AS promedio, COUNT(*) AS total
         FROM encuestas e JOIN incidentes i ON i.id_incidente = e.id_incidente ${whereEncuesta}`,
        paramsEncuesta
    );

    const evaluados = Number(totales.sla_cumplidos) + Number(totales.sla_incumplidos);
    return {
        totales: { total: Number(totales.total), abiertos: Number(totales.abiertos), cerrados: Number(totales.cerrados), porEstado },
        tiempos: { atencion: num(totales.t_atencion), solucion: num(totales.t_solucion) },
        sla: {
            cumplidos: Number(totales.sla_cumplidos),
            incumplidos: Number(totales.sla_incumplidos),
            porcentaje: evaluados ? Math.round((Number(totales.sla_cumplidos) / evaluados) * 100) : null
        },
        satisfaccion: { promedio: num(satisfaccion.promedio), total: Number(satisfaccion.total) },
        porPrioridad,
        porCliente,
        porProgramador,
        porMes
    };
}

// Detalle de incidentes para exportación
async function detalle(rango) {
    const { where, params } = condiciones(rango);
    return query(
        `SELECT i.numero_ticket, i.fecha_registro, c.razon_social AS cliente, c.ruc, i.tipo, i.prioridad, i.asunto, i.estado,
                s.nombre AS programador, i.fecha_atencion, i.fecha_solucion, i.fecha_aprobacion,
                TIMESTAMPDIFF(SECOND, i.fecha_registro, i.fecha_atencion) AS t_atencion,
                TIMESTAMPDIFF(SECOND, i.fecha_registro, i.fecha_solucion) AS t_solucion
         FROM incidentes i
         JOIN clientes c ON c.id_cliente = i.id_cliente
         LEFT JOIN staff s ON s.id_usuario = i.id_programador
         ${where} ORDER BY i.fecha_registro DESC`,
        params
    );
}

// 5400 → "1 h 30 min"
function duracion(seg) {
    if (seg === null || seg === undefined) return '—';
    const total = Math.round(seg);
    if (total < 60) return `${total} s`;
    const min = Math.floor(total / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ${min % 60} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
}

module.exports = { resumen, detalle, duracion };
