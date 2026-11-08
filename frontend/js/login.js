import { api, sesion } from './api.js';

if (sesion.token()) location.replace('index.html');

const $ = id => document.getElementById(id);
const alerta = $('alerta');

function mostrar(mensaje, tipo = 'danger') {
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensaje;
}
const ocultar = () => alerta.classList.add('d-none');

function vista(nombre) {
    ['acceso', 'recuperar', 'restablecer'].forEach(v => $(`vista-${v}`).classList.toggle('d-none', v !== nombre));
    ocultar();
}

// Envía un formulario deshabilitando el botón mientras responde
function enviar(formulario, accion) {
    formulario.addEventListener('submit', async e => {
        e.preventDefault();
        ocultar();
        const boton = formulario.querySelector('button[type="submit"]');
        const texto = boton.textContent;
        boton.disabled = true;
        boton.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            await accion();
        } catch (err) {
            mostrar(err.message);
        } finally {
            boton.disabled = false;
            boton.textContent = texto;
        }
    });
}

function iniciarSesion(datos) {
    sesion.guardar(datos);
    location.replace('index.html');
}

enviar($('form-login'), async () => {
    iniciarSesion(await api('/auth/login', {
        method: 'POST',
        body: { identificador: $('login-id').value.trim(), password: $('login-pass').value }
    }));
});

enviar($('form-recuperar'), async () => {
    const r = await api('/auth/recuperar', { method: 'POST', body: { identificador: $('rec-id').value.trim() } });
    mostrar(r.mensaje, 'success');
});

const token = new URLSearchParams(location.search).get('reset');
if (token) vista('restablecer');

enviar($('form-restablecer'), async () => {
    const r = await api('/auth/restablecer', { method: 'POST', body: { token, password: $('nueva-pass').value } });
    history.replaceState(null, '', 'login.html');
    vista('acceso');
    mostrar(r.mensaje, 'success');
});

$('ir-recuperar').addEventListener('click', e => { e.preventDefault(); vista('recuperar'); });
document.querySelectorAll('.volver-login').forEach(a => a.addEventListener('click', e => { e.preventDefault(); vista('acceso'); }));
