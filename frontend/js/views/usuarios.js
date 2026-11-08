import { api, qs } from '../api.js';
import { usuario } from '../estado.js';
import { esc, fmtFecha, modal, confirmar, toast, vacio, cargando, debounce, conCarga } from '../ui.js';

export async function montar(el) {
    const f = { q: '', rol: '' };

    el.innerHTML = `
        <div class="tarjeta">
            <div class="filtros">
                <div class="campo campo-busqueda"><label for="u-q">Buscar</label><input class="form-control" id="u-q" placeholder="Nombre o usuario"></div>
                <div class="campo"><label for="u-rol">Rol</label>
                    <select class="form-select" id="u-rol"><option value="">Todos</option><option value="programador">Programadores</option><option value="administrador">Administradores</option></select></div>
                <button class="btn btn-primary" id="u-nuevo"><i class="bi bi-plus-lg"></i> Nuevo usuario</button>
            </div>
            <div class="table-responsive" id="tabla"></div>
        </div>`;

    const $ = id => el.querySelector(id);
    let datos = [];
    let solicitud = 0;

    async function cargar() {
        const mia = ++solicitud;
        $('#tabla').innerHTML = cargando();
        try {
            const r = await api(`/usuarios${qs(f)}`);
            if (mia !== solicitud) return;
            datos = r;
            $('#tabla').innerHTML = datos.length ? `
                <table class="table tabla">
                    <thead><tr><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
                    <tbody>${datos.map(u => `
                        <tr>
                            <td class="fw-medium">${esc(u.nombre)}${u.id === usuario.id ? ' <span class="badge bg-light text-secondary">Tú</span>' : ''}<br><small class="text-muted">Desde ${fmtFecha(u.creado_en)}</small></td>
                            <td>${esc(u.usuario)}</td>
                            <td>${esc(u.correo || '—')}</td>
                            <td><span class="chip ${u.rol === 'administrador' ? 'prio-largo' : 'est-atencion'}">${u.rol === 'administrador' ? 'Administrador' : 'Programador'}</span></td>
                            <td><span class="chip ${u.estado === 'activo' ? 'est-aprobado' : 'est-cerrado'}">${u.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                            <td class="text-end text-nowrap">
                                <button class="btn btn-sm btn-light" data-editar="${u.id}" title="Editar"><i class="bi bi-pencil"></i></button>
                                ${u.id === usuario.id ? '' : `<button class="btn btn-sm btn-light" data-estado="${u.id}" title="${u.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                                    <i class="bi ${u.estado === 'activo' ? 'bi-person-slash' : 'bi-person-check'}"></i></button>`}
                            </td>
                        </tr>`).join('')}</tbody>
                </table>` : vacio('bi-people', 'No se encontraron usuarios');
        } catch (err) {
            if (mia === solicitud) $('#tabla').innerHTML = vacio('bi-exclamation-triangle', 'No se pudieron cargar los usuarios', err.message);
        }
    }

    function formulario(u) {
        const editando = Boolean(u);
        const m = modal({
            titulo: editando ? 'Editar usuario' : 'Nuevo usuario',
            cuerpo: `
                <div class="row g-3">
                    <div class="col-12"><label class="form-label fw-semibold" for="m-nombre">Nombre completo</label>
                        <input class="form-control" id="m-nombre" maxlength="120" value="${esc(u?.nombre || '')}"></div>
                    <div class="col-sm-6"><label class="form-label fw-semibold" for="m-usuario">Usuario</label>
                        <input class="form-control" id="m-usuario" maxlength="40" autocomplete="off" value="${esc(u?.usuario || '')}" ${editando ? 'disabled' : ''}></div>
                    <div class="col-sm-6"><label class="form-label fw-semibold" for="m-rol">Rol</label>
                        <select class="form-select" id="m-rol">
                            <option value="programador" ${u?.rol === 'programador' ? 'selected' : ''}>Programador</option>
                            <option value="administrador" ${u?.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
                        </select></div>
                    <div class="col-12"><label class="form-label fw-semibold" for="m-correo">Correo <span class="text-muted fw-normal">(recibe los avisos de nuevos incidentes)</span></label>
                        <input class="form-control" id="m-correo" type="email" value="${esc(u?.correo || '')}"></div>
                    <div class="col-12"><label class="form-label fw-semibold" for="m-pass">${editando ? 'Nueva contraseña' : 'Contraseña'}</label>
                        <input class="form-control" id="m-pass" type="password" autocomplete="new-password" placeholder="${editando ? 'Déjala vacía para no cambiarla' : ''}">
                        <div class="form-text">Mínimo 8 caracteres, con letras y números.</div></div>
                </div>`,
            pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="m-guardar">Guardar</button>`
        });
        const g = id => m.el.querySelector(id);
        g('#m-guardar').addEventListener('click', async e => {
            const body = {
                nombre: g('#m-nombre').value, usuario: g('#m-usuario').value.trim(), rol: g('#m-rol').value,
                correo: g('#m-correo').value, password: g('#m-pass').value
            };
            await conCarga(e.currentTarget, async () => {
                try {
                    const r = await api(editando ? `/usuarios/${u.id}` : '/usuarios', { method: editando ? 'PUT' : 'POST', body });
                    m.cerrar();
                    toast(r.mensaje);
                    cargar();
                } catch (err) { toast(err.message, 'error'); }
            });
        });
    }

    $('#u-nuevo').addEventListener('click', () => formulario(null));
    $('#tabla').addEventListener('click', async e => {
        const editar = e.target.closest('[data-editar]');
        if (editar) return formulario(datos.find(u => u.id === Number(editar.dataset.editar)));

        const cambio = e.target.closest('[data-estado]');
        if (!cambio) return;
        const u = datos.find(x => x.id === Number(cambio.dataset.estado));
        const desactivar = u.estado === 'activo';
        if (!(await confirmar({
            titulo: desactivar ? 'Desactivar usuario' : 'Activar usuario',
            mensaje: desactivar ? `${u.nombre} ya no podrá iniciar sesión.` : `${u.nombre} podrá volver a iniciar sesión.`,
            textoOk: desactivar ? 'Desactivar' : 'Activar',
            peligro: desactivar
        }))) return;
        try {
            const r = await api(`/usuarios/${u.id}/estado`, { method: 'PATCH', body: { estado: desactivar ? 'inactivo' : 'activo' } });
            toast(r.mensaje);
            cargar();
        } catch (err) { toast(err.message, 'error'); }
    });

    const buscar = debounce(cargar, 350);
    $('#u-q').addEventListener('input', e => { f.q = e.target.value.trim(); buscar(); });
    $('#u-rol').addEventListener('change', e => { f.rol = e.target.value; cargar(); });

    await cargar();
}
