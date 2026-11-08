import { api, sesion } from './api.js';
import { usuario, esStaff, esCliente, fijarSocket, lanzar, navegar } from './estado.js';
import { esc, iniciales, tiempoRelativo, toast, vacio } from './ui.js';

if (!usuario) {
    location.replace('login.html');
    throw new Error('Sin sesión');
}

const STAFF = ['programador', 'administrador'];
const TODOS = ['cliente', ...STAFF];

// Mapa de pantallas por rol. `cargar` importa el módulo de la vista solo cuando se necesita.
const RUTAS = [
    { ruta: 'dashboard', titulo: 'Dashboard', icono: 'bi-speedometer2', roles: STAFF, cargar: () => import('./views/dashboard.js') },
    { ruta: 'incidentes', titulo: esCliente ? 'Mis incidentes' : 'Incidentes', icono: 'bi-ticket-detailed', roles: TODOS, cargar: () => import('./views/incidentes.js') },
    { ruta: 'nuevo', titulo: 'Nuevo incidente', icono: 'bi-plus-circle', roles: ['cliente'], cargar: () => import('./views/nuevo.js') },
    { ruta: 'clientes', titulo: 'Clientes', icono: 'bi-buildings', roles: ['administrador'], cargar: () => import('./views/clientes.js'), grupo: 'Administración' },
    { ruta: 'usuarios', titulo: 'Usuarios', icono: 'bi-people', roles: ['administrador'], cargar: () => import('./views/usuarios.js') },
    { ruta: 'reportes', titulo: 'Reportes', icono: 'bi-bar-chart-line', roles: STAFF, cargar: () => import('./views/reportes.js') },
    { ruta: 'auditoria', titulo: 'Auditoría', icono: 'bi-shield-check', roles: ['administrador'], cargar: () => import('./views/auditoria.js') },
    { ruta: 'cuenta', titulo: 'Mi cuenta', icono: 'bi-person-gear', roles: TODOS, cargar: () => import('./views/cuenta.js'), grupo: 'Cuenta' }
];
// "incidentes/12" es una pantalla de detalle dentro de la sección Incidentes
const DETALLE = { titulo: 'Incidente', cargar: () => import('./views/detalle.js') };

const visibles = RUTAS.filter(r => r.roles.includes(usuario.rol));
const inicio = esStaff ? 'dashboard' : 'incidentes';

const $ = id => document.getElementById(id);
const contenido = $('contenido');

// ---------- Cabecera y menú ----------

$('usuario-avatar').textContent = iniciales(usuario.nombre);
$('usuario-nombre').textContent = usuario.nombre;
$('usuario-rol').textContent = usuario.rol;
$('btn-salir').addEventListener('click', () => sesion.cerrar());

$('menu').innerHTML = visibles.map(r => `
    ${r.grupo ? `<div class="menu-titulo">${r.grupo}</div>` : ''}
    <a href="#/${r.ruta}" data-ruta="${r.ruta}"><i class="bi ${r.icono}"></i><span>${r.titulo}</span></a>`).join('');

// ---------- Enrutador ----------

let destruirVista = null;
let numeroNavegacion = 0;

function leerHash() {
    const [camino, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [ruta, ...args] = camino.split('/').filter(Boolean);
    return { ruta: ruta || inicio, args, consulta: new URLSearchParams(consulta) };
}

async function enrutar() {
    const { ruta, args, consulta } = leerHash();
    const definicion = ruta === 'incidentes' && args.length ? DETALLE : visibles.find(r => r.ruta === ruta);
    if (!definicion) return navegar(`/${inicio}`);

    const mia = ++numeroNavegacion;
    if (destruirVista) { try { destruirVista(); } catch { /* vista ya desmontada */ } destruirVista = null; }

    document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('activo', a.dataset.ruta === ruta));
    $('titulo-pagina').textContent = definicion.titulo;
    document.title = `${definicion.titulo} · Mesa de Ayuda`;
    contenido.innerHTML = '<div class="vacio"><div class="spinner-border text-primary"></div></div>';
    bootstrap.Offcanvas.getInstance($('sidebar'))?.hide();
    window.scrollTo(0, 0);

    try {
        const modulo = await definicion.cargar();
        if (mia !== numeroNavegacion) return;
        contenido.innerHTML = '';
        const resultado = await modulo.montar(contenido, {
            args, consulta,
            titulo: t => { if (mia === numeroNavegacion) { $('titulo-pagina').textContent = t; document.title = `${t} · Mesa de Ayuda`; } }
        });
        if (mia === numeroNavegacion) destruirVista = resultado || null;
        else if (resultado) resultado();
    } catch (err) {
        if (mia !== numeroNavegacion) return;
        contenido.innerHTML = vacio('bi-exclamation-triangle', 'No se pudo cargar la pantalla', err.message);
    }
}

window.addEventListener('hashchange', enrutar);

// ---------- Notificaciones ----------

const ICONOS_AVISO = {
    nuevo_incidente: 'bi-ticket-detailed', estado: 'bi-arrow-repeat', mensaje: 'bi-chat-dots', observacion: 'bi-journal-text',
    asignacion: 'bi-person-check', nuevo_cliente: 'bi-building-add'
};

let avisos = [];

function pintarAvisos() {
    const sinLeer = avisos.filter(a => !a.leido).length;
    const contador = $('avisos-contador');
    contador.textContent = sinLeer > 99 ? '99+' : sinLeer;
    contador.classList.toggle('d-none', sinLeer === 0);

    $('avisos-lista').innerHTML = avisos.length
        ? avisos.map(a => `
            <div class="aviso ${a.leido ? '' : 'sin-leer'}" data-id="${a.id}" data-incidente="${a.id_incidente || ''}">
                <i class="bi ${ICONOS_AVISO[a.tipo] || 'bi-bell'}"></i>
                <div class="min-w-0"><p>${esc(a.mensaje)}</p><small class="text-muted">${tiempoRelativo(a.creado_en)}</small></div>
            </div>`).join('')
        : vacio('bi-bell-slash', 'Sin notificaciones');
}

async function cargarAvisos() {
    try {
        avisos = (await api('/avisos')).avisos;
        pintarAvisos();
    } catch { /* se reintenta con el próximo evento */ }
}

$('avisos-lista').addEventListener('click', async e => {
    const el = e.target.closest('.aviso');
    if (!el) return;
    const aviso = avisos.find(a => a.id === Number(el.dataset.id));
    if (aviso && !aviso.leido) {
        aviso.leido = 1;
        pintarAvisos();
        api(`/avisos/${aviso.id}/leer`, { method: 'PUT' }).catch(() => {});
    }
    bootstrap.Dropdown.getInstance($('btn-avisos'))?.hide();
    if (el.dataset.incidente) navegar(`/incidentes/${el.dataset.incidente}`);
});

$('avisos-leer').addEventListener('click', async () => {
    avisos.forEach(a => { a.leido = 1; });
    pintarAvisos();
    api('/avisos/leer', { method: 'PUT' }).catch(() => {});
});

// Refresca los textos "hace x min" al abrir la campana
$('btn-avisos').addEventListener('show.bs.dropdown', pintarAvisos);

// ---------- Tiempo real ----------

function conectarSocket() {
    const socket = io({ auth: { token: sesion.token() } });
    fijarSocket(socket);

    socket.on('connect', () => lanzar('conexion', true));
    socket.on('disconnect', () => lanzar('conexion', false));
    socket.on('connect_error', err => { if (err.message === 'no autorizado') sesion.cerrar(); });

    socket.on('aviso', aviso => {
        const i = avisos.findIndex(a => a.id === aviso.id);
        if (i >= 0) avisos.splice(i, 1);
        avisos.unshift(aviso);
        pintarAvisos();
        // Si ya está mirando ese incidente, el chat en pantalla basta
        const viendoIncidente = aviso.id_incidente && location.hash.startsWith(`#/incidentes/${aviso.id_incidente}`);
        if (!(aviso.tipo === 'mensaje' && viendoIncidente)) toast(aviso.mensaje, 'info');
    });
    socket.on('incidente:cambio', datos => lanzar('incidente:cambio', datos));
    socket.on('chat:nuevo', datos => lanzar('chat:nuevo', datos));
    socket.on('mensaje', datos => lanzar('mensaje', datos));
    socket.on('escribiendo', datos => lanzar('escribiendo', datos));
    // Al reconectar se pierden eventos: las vistas deben recargar
    socket.io.on('reconnect', () => { cargarAvisos(); lanzar('reconectado'); });
}

conectarSocket();
cargarAvisos();
if (!location.hash) location.hash = `/${inicio}`;
enrutar();
