import { api, qs } from '../api.js';
import { esc, fmtFecha, modal, confirmar, toast, vacio, cargando, paginacion, debounce, conCarga } from '../ui.js';

export async function montar(el) {
    const f = { q: '', estado: '', page: 1 };

    el.innerHTML = `
        <div class="tarjeta">
            <div class="filtros">
                <div class="campo campo-busqueda"><label for="c-q">Buscar</label>
                    <input class="form-control" id="c-q" placeholder="RUC, razón social, responsable o correo"></div>
                <div class="campo"><label for="c-estado">Estado</label>
                    <select class="form-select" id="c-estado"><option value="">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></div>
                <button class="btn btn-primary" id="c-nuevo"><i class="bi bi-plus-lg"></i> Nuevo cliente</button>
            </div>
            <div class="table-responsive" id="tabla"></div>
            <div id="paginacion"></div>
        </div>`;

    const $ = id => el.querySelector(id);
    let datos = [];
    let solicitud = 0;

    async function cargar() {
        const mia = ++solicitud;
        $('#tabla').innerHTML = cargando();
        try {
            const r = await api(`/clientes${qs(f)}`);
            if (mia !== solicitud) return;
            datos = r.datos;
            $('#paginacion').innerHTML = paginacion(r.total, r.page, r.limit);
            $('#tabla').innerHTML = datos.length ? `
                <table class="table tabla">
                    <thead><tr><th>RUC</th><th>Razón social</th><th>Responsable</th><th>Contacto</th><th class="text-end">Incidentes</th><th>Estado</th><th></th></tr></thead>
                    <tbody>${datos.map(c => `
                        <tr>
                            <td class="text-nowrap fw-medium">${esc(c.ruc)}</td>
                            <td>${esc(c.razon_social)}<br><small class="text-muted">Desde ${fmtFecha(c.creado_en)}</small></td>
                            <td>${esc(c.responsable)}</td>
                            <td>${esc(c.correo)}<br><small class="text-muted">${esc(c.celular)}</small></td>
                            <td class="text-end">${c.incidentes}</td>
                            <td><span class="chip ${c.estado === 'activo' ? 'est-aprobado' : 'est-cerrado'}">${c.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                            <td class="text-end text-nowrap">
                                <button class="btn btn-sm btn-light" data-editar="${c.id}" title="Editar"><i class="bi bi-pencil"></i></button>
                                <button class="btn btn-sm btn-light" data-estado="${c.id}" title="${c.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                                    <i class="bi ${c.estado === 'activo' ? 'bi-person-slash' : 'bi-person-check'}"></i></button>
                            </td>
                        </tr>`).join('')}</tbody>
                </table>` : vacio('bi-buildings', 'No se encontraron clientes');
        } catch (err) {
            if (mia === solicitud) $('#tabla').innerHTML = vacio('bi-exclamation-triangle', 'No se pudieron cargar los clientes', err.message);
        }
    }

    // Formulario de alta / edición
    function formulario(cliente) {
        const editando = Boolean(cliente);
        const m = modal({
            titulo: editando ? 'Editar cliente' : 'Nuevo cliente',
            cuerpo: `
                <form id="form-cliente" novalidate><div class="row g-3">
                    <div class="col-sm-5"><label class="form-label fw-semibold" for="m-ruc">RUC</label>
                        <input class="form-control" id="m-ruc" maxlength="11" inputmode="numeric" value="${esc(cliente?.ruc || '')}" ${editando ? 'disabled' : ''}></div>
                    <div class="col-sm-7"><label class="form-label fw-semibold" for="m-razon">Razón social</label>
                        <input class="form-control" id="m-razon" maxlength="150" value="${esc(cliente?.razon_social || '')}"></div>
                    <div class="col-12"><label class="form-label fw-semibold" for="m-resp">Nombre del responsable</label>
                        <input class="form-control" id="m-resp" maxlength="120" value="${esc(cliente?.responsable || '')}"></div>
                    <div class="col-sm-7"><label class="form-label fw-semibold" for="m-correo">Correo</label>
                        <input class="form-control" id="m-correo" type="email" value="${esc(cliente?.correo || '')}"></div>
                    <div class="col-sm-5"><label class="form-label fw-semibold" for="m-cel">Celular</label>
                        <input class="form-control" id="m-cel" inputmode="tel" value="${esc(cliente?.celular || '')}"></div>
                    <div class="col-12"><label class="form-label fw-semibold" for="m-pass">${editando ? 'Nueva contraseña' : 'Contraseña'}</label>
                        <div class="input-group">
                            <input class="form-control" id="m-pass" type="text" autocomplete="off" placeholder="${editando ? 'Déjala vacía para no cambiarla' : ''}">
                            <button class="btn btn-outline-secondary" type="button" id="m-generar"><i class="bi bi-magic"></i> Generar</button>
                        </div>
                        <div class="form-text">Mínimo 8 caracteres, con letras y números. Entrégasela al cliente: podrá cambiarla desde su cuenta. Su usuario para ingresar es el RUC.</div></div>
                </div></form>`,
            pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="m-guardar">Guardar</button>`
        });
        const g = id => m.el.querySelector(id);
        g('#m-ruc').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
        g('#m-generar').addEventListener('click', () => {
            const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
            const numeros = '23456789';
            const azar = lista => lista[crypto.getRandomValues(new Uint32Array(1))[0] % lista.length];
            const clave = Array.from({ length: 8 }, () => azar(letras)).concat(Array.from({ length: 3 }, () => azar(numeros)));
            g('#m-pass').value = clave.sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128).join('');
        });
        g('#m-guardar').addEventListener('click', async e => {
            const body = {
                ruc: g('#m-ruc').value.trim(), razon_social: g('#m-razon').value, responsable: g('#m-resp').value,
                correo: g('#m-correo').value, celular: g('#m-cel').value, password: g('#m-pass').value
            };
            await conCarga(e.currentTarget, async () => {
                try {
                    const r = await api(editando ? `/clientes/${cliente.id}` : '/clientes', { method: editando ? 'PUT' : 'POST', body });
                    m.cerrar();
                    toast(r.mensaje);
                    cargar();
                } catch (err) { toast(err.message, 'error'); }
            });
        });
    }

    $('#c-nuevo').addEventListener('click', () => formulario(null));

    $('#tabla').addEventListener('click', async e => {
        const editar = e.target.closest('[data-editar]');
        if (editar) return formulario(datos.find(c => c.id === Number(editar.dataset.editar)));

        const cambio = e.target.closest('[data-estado]');
        if (!cambio) return;
        const cliente = datos.find(c => c.id === Number(cambio.dataset.estado));
        const desactivar = cliente.estado === 'activo';
        const ok = await confirmar({
            titulo: desactivar ? 'Desactivar cliente' : 'Activar cliente',
            mensaje: desactivar
                ? `${cliente.razon_social} no podrá iniciar sesión mientras esté desactivado. Su historial se conserva.`
                : `${cliente.razon_social} podrá volver a iniciar sesión.`,
            textoOk: desactivar ? 'Desactivar' : 'Activar',
            peligro: desactivar
        });
        if (!ok) return;
        try {
            const r = await api(`/clientes/${cliente.id}/estado`, { method: 'PATCH', body: { estado: desactivar ? 'inactivo' : 'activo' } });
            toast(r.mensaje);
            cargar();
        } catch (err) { toast(err.message, 'error'); }
    });

    $('#paginacion').addEventListener('click', e => {
        const b = e.target.closest('[data-pag]');
        if (b) { f.page = Number(b.dataset.pag); cargar(); }
    });
    const buscar = debounce(() => { f.page = 1; cargar(); }, 350);
    $('#c-q').addEventListener('input', e => { f.q = e.target.value.trim(); buscar(); });
    $('#c-estado').addEventListener('change', e => { f.estado = e.target.value; f.page = 1; cargar(); });

    await cargar();
}
