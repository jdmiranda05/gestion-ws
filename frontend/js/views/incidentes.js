import { api, qs } from '../api.js';
import { esStaff, esCliente, alEvento, navegar } from '../estado.js';
import { esc, fmtFecha, fmtHora, badgePrioridad, badgeEstado, badgeSla, vacio, cargando, paginacion, debounce } from '../ui.js';

const ESTADOS = ['Pendiente', 'En Atención', 'Solucionado', 'Aprobado por Cliente', 'Cerrado'];

export async function montar(el, { consulta }) {
    const f = {
        q: consulta.get('q') || '',
        estado: consulta.get('estado') || '',
        prioridad: consulta.get('prioridad') || '',
        id_programador: consulta.get('id_programador') || '',
        id_cliente: consulta.get('id_cliente') || '',
        desde: consulta.get('desde') || '',
        hasta: consulta.get('hasta') || '',
        page: 1
    };

    const [catalogos, programadores, clientes] = await Promise.all([
        api('/incidentes/catalogos'),
        esStaff ? api('/usuarios/programadores') : [],
        esStaff ? api('/clientes/opciones') : []
    ]);

    const opciones = (lista, valor, texto) => lista.map(x => `<option value="${esc(x[valor])}">${esc(x[texto])}</option>`).join('');

    el.innerHTML = `
        <div class="tarjeta">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 px-3 pt-3">
                <div class="text-muted small" id="resumen"></div>
                ${esCliente ? '<a href="#/nuevo" class="btn btn-primary"><i class="bi bi-plus-lg"></i> Nuevo incidente</a>' : ''}
            </div>
            <div class="filtros">
                <div class="campo campo-busqueda">
                    <label for="f-q">Buscar</label>
                    <input class="form-control" id="f-q" placeholder="${esStaff ? 'Ticket, asunto, cliente o RUC' : 'Ticket o asunto'}">
                </div>
                <div class="campo">
                    <label for="f-prioridad">Prioridad</label>
                    <select class="form-select" id="f-prioridad"><option value="">Todas</option>${opciones(catalogos.prioridades, 'nombre', 'nombre')}</select>
                </div>
                ${esStaff ? `
                <div class="campo">
                    <label for="f-programador">Programador</label>
                    <select class="form-select" id="f-programador"><option value="">Todos</option><option value="sin">Sin asignar</option>${opciones(programadores, 'id', 'nombre')}</select>
                </div>
                <div class="campo">
                    <label for="f-cliente">Cliente</label>
                    <select class="form-select" id="f-cliente"><option value="">Todos</option>${opciones(clientes, 'id', 'razon_social')}</select>
                </div>` : ''}
                <div class="campo"><label for="f-desde">Desde</label><input type="date" class="form-control" id="f-desde"></div>
                <div class="campo"><label for="f-hasta">Hasta</label><input type="date" class="form-control" id="f-hasta"></div>
                <button class="btn btn-light" id="f-limpiar" title="Limpiar filtros"><i class="bi bi-x-circle"></i> Limpiar</button>
            </div>
            <div class="pestanas" id="pestanas">
                ${[['', 'Todos'], ...(esStaff ? [['abiertos', 'Abiertos']] : []), ...ESTADOS.map(e => [e, e])]
                    .map(([valor, texto]) => `<button class="pestana" data-estado="${esc(valor)}">${esc(texto)}</button>`).join('')}
            </div>
            <div class="table-responsive" id="tabla"></div>
            <div id="paginacion"></div>
        </div>`;

    const $ = id => el.querySelector(id);
    const campos = {
        q: $('#f-q'), prioridad: $('#f-prioridad'), desde: $('#f-desde'), hasta: $('#f-hasta'),
        id_programador: $('#f-programador'), id_cliente: $('#f-cliente')
    };
    Object.entries(campos).forEach(([clave, campo]) => { if (campo) campo.value = f[clave]; });

    function marcarPestana() {
        el.querySelectorAll('.pestana').forEach(p => p.classList.toggle('activa', p.dataset.estado === f.estado));
    }

    let solicitud = 0;
    async function cargar({ silencioso = false } = {}) {
        const mia = ++solicitud;
        if (!silencioso) $('#tabla').innerHTML = cargando();
        marcarPestana();
        const parametros = {
            q: f.q, prioridad: f.prioridad, id_programador: f.id_programador, id_cliente: f.id_cliente,
            desde: f.desde, hasta: f.hasta, page: f.page,
            estado: f.estado === 'abiertos' ? '' : f.estado, abiertos: f.estado === 'abiertos' ? 1 : ''
        };
        try {
            const r = await api(`/incidentes${qs(parametros)}`);
            if (mia !== solicitud) return;
            pintar(r);
        } catch (err) {
            if (mia === solicitud) $('#tabla').innerHTML = vacio('bi-exclamation-triangle', 'No se pudieron cargar los incidentes', err.message);
        }
    }

    function pintar({ datos, total, page, limit }) {
        $('#resumen').textContent = `${total} incidente${total === 1 ? '' : 's'}`;
        $('#paginacion').innerHTML = paginacion(total, page, limit);

        if (!datos.length) {
            $('#tabla').innerHTML = vacio('bi-inbox', 'No hay incidentes con estos filtros',
                esCliente ? 'Cuando registres un incidente aparecerá aquí.' : '');
            return;
        }
        $('#tabla').innerHTML = `
            <table class="table tabla">
                <thead><tr>
                    <th>Ticket</th><th>Fecha</th>${esStaff ? '<th>Cliente</th>' : ''}<th>Asunto</th>
                    <th>Prioridad</th><th>Estado</th><th>Programador</th>${esStaff ? '<th>SLA</th>' : ''}
                </tr></thead>
                <tbody>${datos.map(i => `
                    <tr class="fila-click" data-id="${i.id}">
                        <td><span class="ticket-num">${esc(i.numero_ticket)}</span>
                            ${i.sin_leer ? `<span class="badge rounded-pill bg-danger ms-1" title="${i.sin_leer} mensaje(s) sin leer"><i class="bi bi-chat-dots-fill"></i> ${i.sin_leer}</span>` : ''}</td>
                        <td class="text-nowrap">${fmtFecha(i.fecha_registro)}<br><small class="text-muted">${fmtHora(i.fecha_registro)}</small></td>
                        ${esStaff ? `<td>${esc(i.cliente)}<br><small class="text-muted">${esc(i.ruc)}</small></td>` : ''}
                        <td><div class="celda-asunto" title="${esc(i.asunto)}">${esc(i.asunto)}</div><small class="text-muted">${esc(i.tipo)}</small></td>
                        <td>${badgePrioridad(i.prioridad)}</td>
                        <td>${badgeEstado(i.estado)}</td>
                        <td>${esc(i.programador || '—')}</td>
                        ${esStaff ? `<td>${i.estado === 'Cerrado' ? '' : badgeSla(i.sla)}</td>` : ''}
                    </tr>`).join('')}
                </tbody>
            </table>`;
    }

    // ---------- Interacción ----------

    $('#tabla').addEventListener('click', e => {
        const fila = e.target.closest('tr[data-id]');
        if (fila) navegar(`/incidentes/${fila.dataset.id}`);
    });
    $('#paginacion').addEventListener('click', e => {
        const b = e.target.closest('[data-pag]');
        if (b) { f.page = Number(b.dataset.pag); cargar(); }
    });
    $('#pestanas').addEventListener('click', e => {
        const b = e.target.closest('.pestana');
        if (b) { f.estado = b.dataset.estado; f.page = 1; cargar(); }
    });

    const buscar = debounce(() => { f.page = 1; cargar(); }, 350);
    Object.entries(campos).forEach(([clave, campo]) => {
        if (!campo) return;
        campo.addEventListener(clave === 'q' ? 'input' : 'change', () => { f[clave] = campo.value.trim(); buscar(); });
    });
    $('#f-limpiar').addEventListener('click', () => {
        Object.assign(f, { q: '', estado: '', prioridad: '', id_programador: '', id_cliente: '', desde: '', hasta: '', page: 1 });
        Object.values(campos).forEach(c => { if (c) c.value = ''; });
        cargar();
    });

    // Actualización en vivo cuando llega un incidente o un mensaje nuevo
    const refrescar = debounce(() => cargar({ silencioso: true }), 600);
    const bajas = [alEvento('incidente:cambio', refrescar), alEvento('chat:nuevo', refrescar), alEvento('reconectado', refrescar)];

    cargar();
    return () => bajas.forEach(b => b());
}
