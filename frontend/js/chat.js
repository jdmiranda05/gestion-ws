// Chat del incidente: mensajes en tiempo real con imágenes y PDF
import { api, urlArchivo, descargarArchivo, abrirArchivo } from './api.js';
import { alEvento, socket } from './estado.js';
import { esc, textoHtml, fmtHora, fmtFecha, fmtTamano, iniciales, modal, toast, debounce } from './ui.js';

const TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;
const GRUPO_MS = 5 * 60 * 1000;

const etiquetaDia = f => {
    const d = new Date(f);
    const hoy = new Date();
    const ayer = new Date(hoy.getTime() - 86400000);
    if (d.toDateString() === hoy.toDateString()) return 'Hoy';
    if (d.toDateString() === ayer.toDateString()) return 'Ayer';
    return fmtFecha(f);
};

export function crearChat(contenedor, { incidenteId, usuario, habilitado, subtitulo }) {
    const mensajes = [];
    const ids = new Set();
    const urls = new Map(); // ruta → URL local ya resuelta (evita parpadeos al repintar)
    let hayMas = false;
    let pendiente = null;
    let urlPendiente = null;
    let enviando = false;
    let ultimoEscribiendo = 0;
    let temporizadorEscribiendo = null;

    contenedor.innerHTML = `
        <div class="tarjeta chat">
            <div class="chat-cabecera">
                <i class="bi bi-chat-dots-fill text-primary fs-5"></i>
                <div class="flex-grow-1">
                    <div class="fw-semibold">Chat del incidente</div>
                    <small class="text-muted">${esc(subtitulo)}</small>
                </div>
                <span class="punto-vivo ${socket?.connected ? '' : 'off'}" title="${socket?.connected ? 'En línea' : 'Sin conexión en tiempo real'}"></span>
            </div>
            <div class="chat-cuerpo"></div>
            <button class="btn btn-primary btn-sm chat-nuevos"><i class="bi bi-arrow-down"></i> Nuevos mensajes</button>
            <div class="chat-escribiendo"></div>
            ${habilitado ? `
            <div class="chat-compositor">
                <div class="previa-contenedor"></div>
                <div class="chat-caja">
                    <input type="file" class="d-none" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf">
                    <button class="btn btn-light btn-adjuntar" type="button" title="Adjuntar imagen o PDF" aria-label="Adjuntar imagen o PDF"><i class="bi bi-paperclip fs-5"></i></button>
                    <textarea class="form-control" rows="1" maxlength="2000" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
                    <button class="btn btn-primary btn-enviar" type="button" title="Enviar" aria-label="Enviar" disabled><i class="bi bi-send-fill"></i></button>
                </div>
            </div>` : `<div class="chat-solo-lectura"><i class="bi bi-lock"></i> El incidente está cerrado. El chat es de solo lectura.</div>`}
            <div class="chat-soltar">Suelta aquí la imagen o PDF</div>
        </div>`;

    const raiz = contenedor.querySelector('.chat');
    const cuerpo = raiz.querySelector('.chat-cuerpo');
    const botonNuevos = raiz.querySelector('.chat-nuevos');
    const indicador = raiz.querySelector('.chat-escribiendo');
    const punto = raiz.querySelector('.punto-vivo');
    const ta = raiz.querySelector('textarea');
    const entrada = raiz.querySelector('input[type="file"]');
    const botonEnviar = raiz.querySelector('.btn-enviar');
    const zonaPrevia = raiz.querySelector('.previa-contenedor');

    const esPropio = m => m.autor_tipo === usuario.tipo && m.id_autor === usuario.id;
    const estaAbajo = () => cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 80;
    const irAbajo = (suave = true) => {
        cuerpo.style.scrollBehavior = suave ? 'smooth' : 'auto';
        cuerpo.scrollTop = cuerpo.scrollHeight;
        botonNuevos.style.display = 'none';
    };

    // ---------- Pintado ----------

    function htmlAdjunto(m) {
        if (!m.archivo_ruta) return '';
        if (m.archivo_mime.startsWith('image/')) {
            const src = urls.get(m.archivo_ruta);
            return `<img class="adjunto-img" data-ruta="${m.archivo_ruta}" alt="${esc(m.archivo_nombre)}" ${src ? `src="${src}"` : ''}>`;
        }
        return `<a href="#" class="adjunto-pdf" data-pdf="${m.archivo_ruta}" data-nombre="${esc(m.archivo_nombre)}">
            <i class="bi bi-file-earmark-pdf"></i>
            <span class="min-w-0"><span class="d-block text-truncate" style="max-width:180px">${esc(m.archivo_nombre)}</span>
            <small>PDF · ${fmtTamano(m.archivo_tamano)}</small></span>
            <i class="bi bi-download ms-auto" data-descargar="${m.archivo_ruta}"></i></a>`;
    }

    function htmlMensaje(m, previo) {
        const mismoDia = previo && new Date(previo.creado_en).toDateString() === new Date(m.creado_en).toDateString();
        const continuo = previo && mismoDia && previo.autor_tipo === m.autor_tipo && previo.id_autor === m.id_autor &&
            new Date(m.creado_en) - new Date(previo.creado_en) < GRUPO_MS;
        const propio = esPropio(m);
        const separador = mismoDia ? '' : `<div class="chat-dia">${etiquetaDia(m.creado_en)}</div>`;
        return `${separador}
            <div class="msg ${m.autor_tipo} ${propio ? 'propio' : ''} ${continuo ? 'continuo' : 'nuevo-grupo'}" data-id="${m.id}">
                <div class="avatar" title="${esc(m.autor_nombre)}">${esc(iniciales(m.autor_nombre))}</div>
                <div class="burbuja">
                    ${!continuo && !propio ? `<div class="autor">${esc(m.autor_nombre)}${m.autor_tipo === 'staff' ? '<span class="etiqueta-rol">Soporte</span>' : ''}</div>` : ''}
                    ${htmlAdjunto(m)}
                    ${m.texto ? `<div class="texto">${textoHtml(m.texto)}</div>` : ''}
                    <div class="hora">${fmtHora(m.creado_en)}</div>
                </div>
            </div>`;
    }

    function hidratar(ambito) {
        ambito.querySelectorAll('img[data-ruta]:not([src])').forEach(img => {
            const ruta = img.dataset.ruta;
            urlArchivo(ruta).then(url => { urls.set(ruta, url); img.src = url; }).catch(() => {
                img.alt = 'No se pudo cargar la imagen';
            });
        });
    }

    function pintarTodo() {
        const conservar = cuerpo.scrollHeight - cuerpo.scrollTop;
        cuerpo.innerHTML = (hayMas ? '<button class="btn btn-light btn-sm align-self-center mb-2 btn-anteriores">Cargar mensajes anteriores</button>' : '') +
            (mensajes.length ? mensajes.map((m, i) => htmlMensaje(m, mensajes[i - 1])).join('') :
                '<div class="vacio my-auto"><i class="bi bi-chat-square-text"></i><p class="mb-0">Aún no hay mensajes.<br>Escribe el primero para iniciar la conversación.</p></div>');
        hidratar(cuerpo);
        return conservar;
    }

    function agregar(m, { forzarScroll = false } = {}) {
        if (ids.has(m.id)) return;
        ids.add(m.id);
        const previo = mensajes[mensajes.length - 1];
        mensajes.push(m);
        const abajo = estaAbajo();

        if (mensajes.length === 1) {
            pintarTodo();
        } else {
            cuerpo.insertAdjacentHTML('beforeend', htmlMensaje(m, previo));
            hidratar(cuerpo);
        }
        indicador.textContent = '';
        if (forzarScroll || esPropio(m) || abajo) irAbajo();
        else botonNuevos.style.display = 'block';
    }

    // ---------- Carga ----------

    async function cargarInicial() {
        try {
            const r = await api(`/incidentes/${incidenteId}/mensajes`);
            r.mensajes.forEach(m => { ids.add(m.id); mensajes.push(m); });
            hayMas = r.hay_mas;
            pintarTodo();
            irAbajo(false);
            marcarLeido();
        } catch (err) {
            cuerpo.innerHTML = `<div class="vacio my-auto"><i class="bi bi-exclamation-triangle"></i><p>${esc(err.message)}</p></div>`;
        }
    }

    async function cargarAnteriores() {
        const r = await api(`/incidentes/${incidenteId}/mensajes?antes=${mensajes[0].id}`);
        r.mensajes.forEach(m => ids.add(m.id));
        mensajes.unshift(...r.mensajes);
        hayMas = r.hay_mas;
        const antes = pintarTodo();
        cuerpo.style.scrollBehavior = 'auto';
        cuerpo.scrollTop = cuerpo.scrollHeight - antes;
    }

    // Tras una reconexión se piden los últimos mensajes para recuperar los que se perdieron
    async function sincronizar() {
        try {
            const r = await api(`/incidentes/${incidenteId}/mensajes`);
            r.mensajes.forEach(m => agregar(m));
        } catch { /* se reintenta en la siguiente reconexión */ }
    }

    const marcarLeido = debounce(() => {
        if (!document.hidden) api(`/incidentes/${incidenteId}/leido`, { method: 'POST' }).catch(() => {});
    }, 400);

    // ---------- Adjuntos y envío ----------

    function fijarPendiente(archivo) {
        if (!archivo) return;
        if (!TIPOS.includes(archivo.type)) return toast('Solo se permiten imágenes (JPG, PNG, GIF, WEBP) y PDF', 'error');
        if (archivo.size > MAX_BYTES) return toast('El archivo supera el máximo de 10 MB', 'error');
        quitarPendiente();
        pendiente = archivo;
        const esImagen = archivo.type.startsWith('image/');
        if (esImagen) urlPendiente = URL.createObjectURL(archivo);
        zonaPrevia.innerHTML = `
            <div class="previa">
                ${esImagen ? `<img src="${urlPendiente}" alt="">` : '<div class="previa-icono"><i class="bi bi-file-earmark-pdf"></i></div>'}
                <div class="min-w-0"><div class="previa-nombre">${esc(archivo.name || 'Imagen pegada')}</div><small class="text-muted">${fmtTamano(archivo.size)}</small></div>
                <button class="quitar" type="button" aria-label="Quitar adjunto"><i class="bi bi-x-lg"></i></button>
            </div>`;
        actualizarBoton();
        ta.focus();
    }

    function quitarPendiente() {
        if (urlPendiente) URL.revokeObjectURL(urlPendiente);
        pendiente = null;
        urlPendiente = null;
        entrada.value = '';
        zonaPrevia.innerHTML = '';
        actualizarBoton();
    }

    function actualizarBoton() {
        botonEnviar.disabled = enviando || (!ta.value.trim() && !pendiente);
    }

    function ajustarAltura() {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
        ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
    }

    async function enviar() {
        const texto = ta.value.trim();
        if (enviando || (!texto && !pendiente)) return;
        const form = new FormData();
        if (texto) form.append('texto', texto);
        if (pendiente) form.append('archivo', pendiente);
        enviando = true;
        botonEnviar.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        actualizarBoton();
        try {
            const m = await api(`/incidentes/${incidenteId}/mensajes`, { method: 'POST', form });
            ta.value = '';
            ajustarAltura();
            quitarPendiente();
            agregar(m, { forzarScroll: true });
        } catch (err) {
            toast(err.message, 'error'); // el texto y el adjunto se conservan para reintentar
        } finally {
            enviando = false;
            botonEnviar.innerHTML = '<i class="bi bi-send-fill"></i>';
            actualizarBoton();
            ta.focus();
        }
    }

    // ---------- Eventos de la interfaz ----------

    cuerpo.addEventListener('scroll', () => { if (estaAbajo()) botonNuevos.style.display = 'none'; });
    botonNuevos.addEventListener('click', () => irAbajo());

    cuerpo.addEventListener('click', async e => {
        const anteriores = e.target.closest('.btn-anteriores');
        if (anteriores) {
            anteriores.disabled = true;
            return cargarAnteriores().catch(err => { anteriores.disabled = false; toast(err.message, 'error'); });
        }
        const img = e.target.closest('.adjunto-img');
        if (img?.src) {
            const m = modal({
                titulo: img.alt,
                tamano: 'modal-lg',
                cuerpo: `<div class="text-center"><img class="visor-img" src="${img.src}" alt="${esc(img.alt)}"></div>`,
                pie: `<button class="btn btn-outline-primary" id="visor-descargar"><i class="bi bi-download"></i> Descargar</button>
                      <button class="btn btn-light" data-bs-dismiss="modal">Cerrar</button>`
            });
            m.el.querySelector('#visor-descargar').addEventListener('click', () =>
                descargarArchivo(img.dataset.ruta, img.alt).catch(err => toast(err.message, 'error')));
            return;
        }
        const pdf = e.target.closest('.adjunto-pdf');
        if (pdf) {
            e.preventDefault();
            const accion = e.target.closest('[data-descargar]')
                ? descargarArchivo(pdf.dataset.pdf, pdf.dataset.nombre)
                : abrirArchivo(pdf.dataset.pdf);
            accion.catch(err => toast(err.message, 'error'));
        }
    });

    if (habilitado) {
        ajustarAltura();
        raiz.querySelector('.btn-adjuntar').addEventListener('click', () => entrada.click());
        entrada.addEventListener('change', () => fijarPendiente(entrada.files[0]));
        zonaPrevia.addEventListener('click', e => { if (e.target.closest('.quitar')) quitarPendiente(); });
        botonEnviar.addEventListener('click', enviar);

        ta.addEventListener('input', () => {
            ajustarAltura();
            actualizarBoton();
            if (socket && Date.now() - ultimoEscribiendo > 2500) {
                ultimoEscribiendo = Date.now();
                socket.emit('escribiendo', incidenteId);
            }
        });
        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                enviar();
            }
        });
        // Pegar una captura desde el portapapeles
        ta.addEventListener('paste', e => {
            const archivo = [...(e.clipboardData?.files || [])].find(f => TIPOS.includes(f.type));
            if (archivo) {
                e.preventDefault();
                fijarPendiente(archivo);
            }
        });

        // Arrastrar y soltar sobre todo el chat
        let nivel = 0;
        raiz.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { nivel++; raiz.classList.add('arrastrando'); } });
        raiz.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
        raiz.addEventListener('dragleave', () => { if (--nivel <= 0) { nivel = 0; raiz.classList.remove('arrastrando'); } });
        raiz.addEventListener('drop', e => {
            e.preventDefault();
            nivel = 0;
            raiz.classList.remove('arrastrando');
            fijarPendiente(e.dataTransfer.files[0]);
        });
    }

    // ---------- Tiempo real ----------

    const bajas = [
        alEvento('mensaje', m => {
            if (m.id_incidente !== incidenteId) return;
            agregar(m);
            if (!esPropio(m)) marcarLeido();
        }),
        alEvento('escribiendo', d => {
            if (d.id !== incidenteId) return;
            indicador.textContent = `${d.nombre} está escribiendo…`;
            clearTimeout(temporizadorEscribiendo);
            temporizadorEscribiendo = setTimeout(() => { indicador.textContent = ''; }, 3000);
        }),
        alEvento('conexion', conectado => {
            punto.classList.toggle('off', !conectado);
            punto.title = conectado ? 'En línea' : 'Sin conexión en tiempo real';
        }),
        alEvento('reconectado', sincronizar)
    ];
    const alVolver = () => { if (!document.hidden) marcarLeido(); };
    document.addEventListener('visibilitychange', alVolver);

    cargarInicial();

    return {
        destruir() {
            bajas.forEach(baja => baja());
            document.removeEventListener('visibilitychange', alVolver);
            clearTimeout(temporizadorEscribiendo);
            if (urlPendiente) URL.revokeObjectURL(urlPendiente);
        }
    };
}
