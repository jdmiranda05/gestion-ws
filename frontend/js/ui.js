// Utilidades de interfaz: formato, insignias, avisos y modales

export const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Texto de usuario con saltos de línea y enlaces seguros
export const textoHtml = valor => esc(valor).replace(/\n/g, '<br>');

// ---------- Fechas ----------

export const fmtFecha = f => (f ? new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtHora = f => (f ? new Date(f).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
export const fmtFechaHora = f => (f ? `${fmtFecha(f)} ${fmtHora(f)}` : '—');

export function fmtDuracion(seg) {
    if (seg === null || seg === undefined) return '—';
    const total = Math.round(seg);
    if (total < 60) return `${total} s`;
    const min = Math.floor(total / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ${min % 60} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function tiempoRelativo(f) {
    const min = Math.round((Date.now() - new Date(f)) / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `Hace ${min} min`;
    if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
    if (min < 43200) return `Hace ${Math.round(min / 1440)} d`;
    return fmtFecha(f);
}

export function fmtTamano(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
    return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

// ---------- Insignias ----------

const CLASE_PRIORIDAD = {
    'Muy Urgente': 'prio-muy-urgente',
    'Urgente': 'prio-urgente',
    'No Muy Urgente': 'prio-no-urgente',
    'Largo Plazo': 'prio-largo'
};
const CLASE_ESTADO = {
    'Pendiente': 'est-pendiente',
    'En Atención': 'est-atencion',
    'Solucionado': 'est-solucionado',
    'Aprobado por Cliente': 'est-aprobado',
    'Cerrado': 'est-cerrado'
};

export const badgePrioridad = p => `<span class="chip ${CLASE_PRIORIDAD[p] || ''}"><span class="chip-dot"></span>${esc(p)}</span>`;
export const badgeEstado = e => `<span class="chip ${CLASE_ESTADO[e] || ''}">${esc(e)}</span>`;

export function badgeSla(sla, estado) {
    if (!sla) return '';
    const limite = fmtFechaHora(sla.limite);
    const mapa = {
        cumplido: ['sla-ok', 'bi-check-circle-fill', 'SLA cumplido'],
        incumplido: ['sla-mal', 'bi-exclamation-circle-fill', 'SLA incumplido'],
        vencido: ['sla-mal', 'bi-alarm-fill', 'Atención vencida'],
        en_curso: ['sla-curso', 'bi-clock', 'En plazo']
    };
    const [clase, icono, texto] = mapa[sla.estado];
    return `<span class="sla ${clase}" title="Límite de primera atención: ${limite}"><i class="bi ${icono}"></i> ${texto}</span>`;
}

export const iniciales = nombre => String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export const estrellas = n => Array.from({ length: 5 }, (_, i) =>
    `<i class="bi ${i < Math.round(n) ? 'bi-star-fill' : 'bi-star'} text-warning"></i>`).join('');

export function iconoArchivo(mime) {
    if (mime?.startsWith('image/')) return 'bi-file-earmark-image';
    if (mime === 'application/pdf') return 'bi-file-earmark-pdf';
    return 'bi-file-earmark';
}

// ---------- Avisos (toasts) ----------

export function toast(mensaje, tipo = 'ok') {
    let zona = document.getElementById('toasts');
    if (!zona) {
        zona = Object.assign(document.createElement('div'), { id: 'toasts', className: 'toast-container position-fixed top-0 end-0 p-3' });
        document.body.appendChild(zona);
    }
    const colores = { ok: 'text-bg-success', error: 'text-bg-danger', info: 'text-bg-dark' };
    const el = document.createElement('div');
    el.className = `toast align-items-center border-0 ${colores[tipo] || colores.info}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(mensaje)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button></div>`;
    zona.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: tipo === 'error' ? 6000 : 3500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
}

// ---------- Modales ----------

// Crea un modal de Bootstrap; devuelve { el, cerrar, cuando } donde `cuando` resuelve al cerrarse
export function modal({ titulo, cuerpo, pie = '', tamano = '' }) {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${tamano}">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${esc(titulo)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">${cuerpo}</div>
                ${pie ? `<div class="modal-footer">${pie}</div>` : ''}
            </div>
        </div>`;
    document.body.appendChild(el);
    const instancia = new bootstrap.Modal(el);
    const cuando = new Promise(resolver => el.addEventListener('hidden.bs.modal', () => { el.remove(); resolver(); }));
    instancia.show();
    return { el, cerrar: () => instancia.hide(), cuando };
}

export function confirmar({ titulo, mensaje, textoOk = 'Confirmar', peligro = false }) {
    return new Promise(resolver => {
        const m = modal({
            titulo,
            cuerpo: `<p class="mb-0">${esc(mensaje)}</p>`,
            pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                  <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" id="confirmar-ok">${esc(textoOk)}</button>`
        });
        let aceptado = false;
        m.el.querySelector('#confirmar-ok').addEventListener('click', () => { aceptado = true; m.cerrar(); });
        m.cuando.then(() => resolver(aceptado));
    });
}

// Deshabilita un botón mientras se ejecuta una acción asíncrona
export async function conCarga(boton, accion) {
    const original = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Procesando…';
    try {
        return await accion();
    } finally {
        boton.disabled = false;
        boton.innerHTML = original;
    }
}

export const vacio = (icono, titulo, detalle = '') => `
    <div class="vacio"><i class="bi ${icono}"></i><p class="fw-semibold mb-1">${esc(titulo)}</p>${detalle ? `<p class="small mb-0">${esc(detalle)}</p>` : ''}</div>`;

export const cargando = () => '<div class="vacio"><div class="spinner-border text-primary"></div></div>';

export function paginacion(total, page, limit) {
    const paginas = Math.ceil(total / limit);
    if (paginas <= 1) return '';
    const desde = (page - 1) * limit + 1;
    const hasta = Math.min(total, page * limit);
    return `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 px-3 py-2 border-top">
            <small class="text-muted">${desde}–${hasta} de ${total}</small>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" data-pag="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
                <button class="btn btn-outline-secondary disabled">${page} / ${paginas}</button>
                <button class="btn btn-outline-secondary" data-pag="${page + 1}" ${page >= paginas ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
            </div>
        </div>`;
}

export const debounce = (fn, ms = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
