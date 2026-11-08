import { api, qs } from '../api.js';
import { esc, fmtFecha, fmtHora, vacio, cargando, paginacion, debounce } from '../ui.js';

const ETIQUETAS = {
    login: 'Inicio de sesión', registro: 'Registro de cliente', crear_incidente: 'Incidente creado', atender_incidente: 'Atención iniciada',
    solucionar_incidente: 'Incidente solucionado', aprobar_incidente: 'Servicio aprobado', solicitar_revision: 'Revisión solicitada',
    cerrar_incidente: 'Incidente cerrado', asignar_incidente: 'Incidente asignado', observacion_incidente: 'Observación agregada',
    adjuntar_archivo: 'Archivo adjuntado', calificar_servicio: 'Servicio calificado', crear_cliente: 'Cliente creado',
    editar_cliente: 'Cliente editado', activar_cliente: 'Cliente activado', desactivar_cliente: 'Cliente desactivado',
    crear_usuario: 'Usuario creado', editar_usuario: 'Usuario editado', activar_usuario: 'Usuario activado',
    desactivar_usuario: 'Usuario desactivado', cambiar_password: 'Contraseña cambiada', editar_perfil: 'Perfil editado',
    recuperar_password: 'Recuperación solicitada', restablecer_password: 'Contraseña restablecida', exportar_reporte: 'Reporte exportado'
};

export async function montar(el) {
    const f = { q: '', accion: '', desde: '', hasta: '', page: 1 };

    el.innerHTML = `
        <div class="tarjeta">
            <div class="filtros">
                <div class="campo campo-busqueda"><label for="a-q">Buscar</label><input class="form-control" id="a-q" placeholder="Persona o detalle"></div>
                <div class="campo"><label for="a-accion">Acción</label><select class="form-select" id="a-accion"><option value="">Todas</option></select></div>
                <div class="campo"><label for="a-desde">Desde</label><input type="date" class="form-control" id="a-desde"></div>
                <div class="campo"><label for="a-hasta">Hasta</label><input type="date" class="form-control" id="a-hasta"></div>
            </div>
            <div class="table-responsive" id="tabla"></div>
            <div id="paginacion"></div>
        </div>`;

    const $ = id => el.querySelector(id);
    let accionesCargadas = false;
    let solicitud = 0;

    async function cargar() {
        const mia = ++solicitud;
        $('#tabla').innerHTML = cargando();
        try {
            const r = await api(`/auditoria${qs(f)}`);
            if (mia !== solicitud) return;
            if (!accionesCargadas) {
                $('#a-accion').insertAdjacentHTML('beforeend', r.acciones.map(a => `<option value="${esc(a)}">${esc(ETIQUETAS[a] || a)}</option>`).join(''));
                accionesCargadas = true;
            }
            $('#paginacion').innerHTML = paginacion(r.total, r.page, r.limit);
            $('#tabla').innerHTML = r.datos.length ? `
                <table class="table tabla">
                    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
                    <tbody>${r.datos.map(a => `
                        <tr>
                            <td class="text-nowrap">${fmtFecha(a.creado_en)}<br><small class="text-muted">${fmtHora(a.creado_en)}</small></td>
                            <td>${esc(a.actor_nombre)}<br><small class="text-muted text-capitalize">${a.actor_tipo === 'cliente' ? 'Cliente' : 'Personal'}</small></td>
                            <td><span class="chip">${esc(ETIQUETAS[a.accion] || a.accion)}</span></td>
                            <td>${esc(a.detalle || '')}${a.id_entidad ? `<br><small class="text-muted">${esc(a.entidad)} #${a.id_entidad}</small>` : ''}</td>
                            <td class="text-muted small">${esc(a.ip || '')}</td>
                        </tr>`).join('')}</tbody>
                </table>` : vacio('bi-shield-check', 'No hay registros con estos filtros');
        } catch (err) {
            if (mia === solicitud) $('#tabla').innerHTML = vacio('bi-exclamation-triangle', 'No se pudo cargar la auditoría', err.message);
        }
    }

    $('#paginacion').addEventListener('click', e => {
        const b = e.target.closest('[data-pag]');
        if (b) { f.page = Number(b.dataset.pag); cargar(); }
    });
    const buscar = debounce(() => { f.page = 1; cargar(); }, 350);
    $('#a-q').addEventListener('input', e => { f.q = e.target.value.trim(); buscar(); });
    [['#a-accion', 'accion'], ['#a-desde', 'desde'], ['#a-hasta', 'hasta']].forEach(([id, clave]) =>
        $(id).addEventListener('change', e => { f[clave] = e.target.value; f.page = 1; cargar(); }));

    await cargar();
}
