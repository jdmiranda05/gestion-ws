import { api, sesion } from '../api.js';
import { esCliente } from '../estado.js';
import { esc, toast, conCarga } from '../ui.js';

export async function montar(el) {
    const { perfil } = await api('/auth/me');

    const campo = (id, etiqueta, valor, extra = '') => `
        <div class="col-12"><label class="form-label fw-semibold" for="${id}">${etiqueta}</label>
        <input class="form-control" id="${id}" value="${esc(valor || '')}" ${extra}></div>`;

    el.innerHTML = `
        <div class="row g-4 justify-content-center">
            <div class="col-lg-6">
                <form class="tarjeta" id="form-perfil" novalidate>
                    <div class="tarjeta-cabecera"><i class="bi bi-person text-primary"></i> Mis datos</div>
                    <div class="tarjeta-cuerpo"><div class="row g-3">
                        ${esCliente ? `
                            ${campo('p-ruc', 'RUC', perfil.ruc, 'disabled')}
                            ${campo('p-razon', 'Razón social', perfil.razon_social, 'disabled')}
                            ${campo('p-resp', 'Nombre del responsable', perfil.responsable, 'maxlength="120"')}
                            ${campo('p-correo', 'Correo', perfil.correo, 'type="email"')}
                            ${campo('p-cel', 'Celular', perfil.celular, 'inputmode="tel"')}` : `
                            ${campo('p-usuario', 'Usuario', perfil.usuario, 'disabled')}
                            ${campo('p-nombre', 'Nombre', perfil.nombre, 'maxlength="120"')}
                            ${campo('p-correo', 'Correo', perfil.correo, 'type="email"')}`}
                    </div></div>
                    <div class="px-3 py-3 border-top text-end"><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
                </form>
            </div>
            <div class="col-lg-5">
                <form class="tarjeta" id="form-password" novalidate>
                    <div class="tarjeta-cabecera"><i class="bi bi-key text-primary"></i> Cambiar contraseña</div>
                    <div class="tarjeta-cuerpo"><div class="row g-3">
                        <div class="col-12"><label class="form-label fw-semibold" for="w-actual">Contraseña actual</label>
                            <input class="form-control" id="w-actual" type="password" autocomplete="current-password"></div>
                        <div class="col-12"><label class="form-label fw-semibold" for="w-nueva">Nueva contraseña</label>
                            <input class="form-control" id="w-nueva" type="password" autocomplete="new-password">
                            <div class="form-text">Mínimo 8 caracteres, con letras y números.</div></div>
                    </div></div>
                    <div class="px-3 py-3 border-top text-end"><button class="btn btn-primary" type="submit">Actualizar contraseña</button></div>
                </form>
            </div>
        </div>`;

    const $ = id => el.querySelector(id);

    $('#form-perfil').addEventListener('submit', async e => {
        e.preventDefault();
        const body = esCliente
            ? { responsable: $('#p-resp').value, correo: $('#p-correo').value, celular: $('#p-cel').value }
            : { nombre: $('#p-nombre').value, correo: $('#p-correo').value };
        await conCarga(e.submitter, async () => {
            try {
                const r = await api('/auth/perfil', { method: 'PUT', body });
                if (!esCliente) sesion.actualizarUsuario({ nombre: body.nombre });
                toast(r.mensaje);
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    $('#form-password').addEventListener('submit', async e => {
        e.preventDefault();
        await conCarga(e.submitter, async () => {
            try {
                const r = await api('/auth/password', { method: 'PUT', body: { actual: $('#w-actual').value, nueva: $('#w-nueva').value } });
                $('#w-actual').value = '';
                $('#w-nueva').value = '';
                toast(r.mensaje);
            } catch (err) { toast(err.message, 'error'); }
        });
    });
}
