import { api, urlArchivo, descargarArchivo, abrirArchivo } from '../api.js';
import { usuario, esStaff, esCliente, socket, alEvento, navegar } from '../estado.js';
import {
    esc, textoHtml, fmtFecha, fmtHora, fmtFechaHora, fmtDuracion, fmtTamano, estrellas, iconoArchivo,
    badgePrioridad, badgeEstado, badgeSla, modal, confirmar, toast, conCarga, debounce
} from '../ui.js';
import { crearChat } from '../chat.js';

const ICONO_SEGUIMIENTO = {
    creacion: 'bi-plus-lg', atencion: 'bi-play-fill', observacion: 'bi-chat-left-text', solucion: 'bi-check-lg', aprobacion: 'bi-hand-thumbs-up-fill',
    revision: 'bi-arrow-counterclockwise', cierre: 'bi-lock-fill', asignacion: 'bi-person-check', archivo: 'bi-paperclip'
};
const TITULO_SEGUIMIENTO = {
    creacion: 'Incidente registrado', atencion: 'En atención', observacion: 'Observación', solucion: 'Solución registrada',
    aprobacion: 'Aprobado por el cliente', revision: 'Revisión solicitada', cierre: 'Incidente cerrado', asignacion: 'Asignación', archivo: 'Archivos adjuntados'
};

const CON_TEXTO = ['observacion', 'solucion', 'revision', 'archivo', 'asignacion'];

export async function montar(el, { args, titulo }) {
    const id = Number(args[0]);
    let inc = await api(`/incidentes/${id}`);
    titulo(inc.numero_ticket);

    el.innerHTML = `
        <a href="#/incidentes" class="btn btn-link text-decoration-none px-0 mb-2"><i class="bi bi-arrow-left"></i> ${esCliente ? 'Mis incidentes' : 'Incidentes'}</a>
        <div class="row g-4">
            <div class="col-xl-7" id="col-info"></div>
            <div class="col-xl-5" id="col-chat"></div>
        </div>`;

    const info = el.querySelector('#col-info');
    let chat = null;
    let chatHabilitado = null;

    const puede = accion => inc.acciones.includes(accion);

    // ---------- Pintado ----------

    function filaDato(etiqueta, valor) {
        return `<div class="dato"><span>${etiqueta}</span><span>${valor}</span></div>`;
    }

    function htmlAcciones() {
        const botones = [];
        if (puede('atender')) botones.push('<button class="btn btn-primary" data-accion="atender"><i class="bi bi-play-fill"></i> Iniciar atención</button>');
        if (puede('solucionar')) botones.push('<button class="btn btn-success" data-accion="solucionar"><i class="bi bi-check2-circle"></i> Marcar como solucionado</button>');
        if (puede('cerrar')) botones.push('<button class="btn btn-dark" data-accion="cerrar"><i class="bi bi-lock"></i> Cerrar incidente</button>');
        if (puede('asignar')) botones.push('<button class="btn btn-outline-secondary" data-accion="asignar"><i class="bi bi-person-plus"></i> Asignar</button>');
        if (puede('aprobar')) botones.push('<button class="btn btn-success" data-accion="aprobar"><i class="bi bi-hand-thumbs-up"></i> Aprobar servicio</button>');
        if (puede('revision')) botones.push('<button class="btn btn-outline-danger" data-accion="revision"><i class="bi bi-arrow-counterclockwise"></i> Solicitar revisión</button>');
        // En pantallas angostas el chat queda debajo: atajo para llegar a él
        botones.push('<button class="btn btn-outline-primary d-xl-none" data-accion="irChat"><i class="bi bi-chat-dots"></i> Ir al chat</button>');
        return `<div class="d-flex flex-wrap gap-2 mt-3">${botones.join('')}</div>`;
    }

    function htmlArchivos() {
        if (!inc.archivos.length) return '<p class="text-muted small mb-0">No hay archivos adjuntos.</p>';
        return inc.archivos.map(a => {
            const esImagen = a.mime.startsWith('image/');
            return `
                <div class="archivo-item">
                    <div class="archivo-mini ${a.mime === 'application/pdf' ? 'pdf' : ''}" data-ver="${a.ruta}" data-mime="${a.mime}" data-nombre="${esc(a.nombre_archivo)}">
                        ${esImagen ? `<img data-ruta="${a.ruta}" alt="">` : `<i class="bi ${iconoArchivo(a.mime)}"></i>`}
                    </div>
                    <div class="flex-grow-1 min-w-0">
                        <div class="text-truncate fw-medium">${esc(a.nombre_archivo)}</div>
                        <small class="text-muted">${fmtTamano(a.tamano)} · ${esc(a.subido_por_nombre)} · ${fmtFechaHora(a.creado_en)}</small>
                    </div>
                    <button class="btn btn-sm btn-light" data-descargar="${a.ruta}" data-nombre="${esc(a.nombre_archivo)}" title="Descargar"><i class="bi bi-download"></i></button>
                </div>`;
        }).join('');
    }

    function htmlHistorial() {
        return `<div class="linea">${inc.seguimiento.map(s => `
            <div class="linea-item">
                <span class="linea-punto ${s.tipo}"><i class="bi ${ICONO_SEGUIMIENTO[s.tipo] || 'bi-dot'}"></i></span>
                <div class="linea-titulo">${TITULO_SEGUIMIENTO[s.tipo] || esc(s.tipo)}</div>
                <div class="linea-meta">${esc(s.autor_nombre)} · ${fmtFecha(s.creado_en)} ${fmtHora(s.creado_en)}</div>
                ${s.observacion && CON_TEXTO.includes(s.tipo) ? `<div class="texto-largo small mt-1">${textoHtml(s.observacion)}</div>` : ''}
            </div>`).join('')}</div>`;
    }

    function htmlEncuesta() {
        if (inc.encuesta) {
            return `<div class="tarjeta mb-4"><div class="tarjeta-cabecera"><i class="bi bi-star text-warning"></i> Valoración del servicio</div>
                <div class="tarjeta-cuerpo">${estrellas(inc.encuesta.calificacion)}
                ${inc.encuesta.comentario ? `<p class="mb-0 mt-2 texto-largo">${textoHtml(inc.encuesta.comentario)}</p>` : ''}</div></div>`;
        }
        if (!puede('calificar')) return '';
        return `<div class="tarjeta mb-4"><div class="tarjeta-cabecera"><i class="bi bi-star text-warning"></i> ¿Cómo fue la atención?</div>
            <div class="tarjeta-cuerpo">
                <div class="estrellas-input mb-2" id="estrellas">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" aria-label="${n} estrellas"><i class="bi bi-star-fill"></i></button>`).join('')}</div>
                <textarea class="form-control mb-2" id="encuesta-comentario" rows="2" maxlength="500" placeholder="Comentario (opcional)"></textarea>
                <button class="btn btn-primary" id="enviar-encuesta" disabled>Enviar valoración</button>
            </div></div>`;
    }

    function pintar() {
        const tiempos = [
            ['Tiempo de atención', fmtDuracion(inc.tiempo_atencion)],
            ['Tiempo de solución', fmtDuracion(inc.tiempo_solucion)]
        ];
        info.innerHTML = `
            <div class="tarjeta mb-4">
                <div class="tarjeta-cuerpo">
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <span class="ticket-num fs-6">${esc(inc.numero_ticket)}</span>
                        ${badgePrioridad(inc.prioridad)} ${badgeEstado(inc.estado)}
                        ${inc.estado !== 'Cerrado' ? badgeSla(inc.sla) : ''}
                    </div>
                    <h2 class="h4 fw-bold mb-0">${esc(inc.asunto)}</h2>
                    ${htmlAcciones()}
                </div>
            </div>

            <div class="row g-4 mb-4">
                <div class="col-md-6"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-info-circle text-primary"></i> Información</div><div class="tarjeta-cuerpo py-2">
                    ${esStaff ? filaDato('Cliente', `${esc(inc.cliente)}<br><small class="text-muted">RUC ${esc(inc.ruc)}</small>`) : ''}
                    ${esStaff ? filaDato('Contacto', `${esc(inc.responsable)}<br><small class="text-muted">${esc(inc.cliente_correo)} · ${esc(inc.cliente_celular)}</small>`) : ''}
                    ${filaDato('Tipo', esc(inc.tipo))}
                    ${filaDato('Programador', esc(inc.programador || 'Sin asignar'))}
                    ${filaDato('Revisiones solicitadas', inc.revisiones)}
                </div></div></div>
                <div class="col-md-6"><div class="tarjeta h-100"><div class="tarjeta-cabecera"><i class="bi bi-calendar-event text-primary"></i> Fechas y tiempos</div><div class="tarjeta-cuerpo py-2">
                    ${filaDato('Registro', fmtFechaHora(inc.fecha_registro))}
                    ${filaDato('Atención', fmtFechaHora(inc.fecha_atencion))}
                    ${filaDato('Solución', fmtFechaHora(inc.fecha_solucion))}
                    ${filaDato('Aprobación', inc.fecha_aprobacion ? `${fmtFechaHora(inc.fecha_aprobacion)}<br><small class="text-muted">por ${esc(inc.cliente)}</small>` : '—')}
                    ${inc.fecha_cierre ? filaDato('Cierre', fmtFechaHora(inc.fecha_cierre)) : ''}
                    ${tiempos.map(([e, v]) => filaDato(e, v)).join('')}
                </div></div></div>
            </div>

            <div class="tarjeta mb-4"><div class="tarjeta-cabecera"><i class="bi bi-card-text text-primary"></i> Descripción</div>
                <div class="tarjeta-cuerpo texto-largo">${textoHtml(inc.descripcion)}</div></div>

            ${inc.solucion ? `<div class="tarjeta mb-4 border-success"><div class="tarjeta-cabecera text-success"><i class="bi bi-check2-circle"></i> Respuesta del programador</div>
                <div class="tarjeta-cuerpo texto-largo">${textoHtml(inc.solucion)}
                ${inc.fecha_solucion ? `<div class="small text-muted mt-3">Solucionado el ${fmtFecha(inc.fecha_solucion)} a las ${fmtHora(inc.fecha_solucion)}</div>` : ''}</div></div>` : ''}

            ${htmlEncuesta()}

            <div class="tarjeta mb-4">
                <div class="tarjeta-cabecera"><i class="bi bi-paperclip text-primary"></i> Archivos adjuntos <span class="badge bg-light text-secondary">${inc.archivos.length}</span>
                    ${puede('adjuntar') ? `<button class="btn btn-sm btn-outline-primary ms-auto" id="btn-adjuntar"><i class="bi bi-plus-lg"></i> Adjuntar</button>
                    <input type="file" id="entrada-adjuntos" class="d-none" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf">` : ''}
                </div>
                <div class="tarjeta-cuerpo py-2">${htmlArchivos()}</div>
            </div>

            <div class="tarjeta mb-4">
                <div class="tarjeta-cabecera"><i class="bi bi-clock-history text-primary"></i> Historial</div>
                <div class="tarjeta-cuerpo">
                    ${htmlHistorial()}
                    ${puede('observar') ? `
                    <form id="form-observacion" class="mt-4 pt-3 border-top">
                        <label class="form-label fw-semibold small" for="observacion">Agregar observación</label>
                        <div class="d-flex gap-2">
                            <textarea class="form-control" id="observacion" rows="2" maxlength="2000" placeholder="Registra un avance o nota visible para el cliente"></textarea>
                            <button class="btn btn-primary align-self-end" type="submit">Agregar</button>
                        </div>
                    </form>` : ''}
                </div>
            </div>`;

        info.querySelectorAll('img[data-ruta]').forEach(img => urlArchivo(img.dataset.ruta).then(u => { img.src = u; }).catch(() => {}));
        montarChat();
    }

    // El chat se crea una sola vez; solo se recrea si cambia entre abierto y cerrado
    function montarChat() {
        const habilitado = puede('chatear');
        if (chat && chatHabilitado === habilitado) return;
        chat?.destruir();
        chatHabilitado = habilitado;
        chat = crearChat(el.querySelector('#col-chat'), {
            incidenteId: id,
            usuario,
            habilitado,
            subtitulo: esStaff ? `Conversación con ${inc.cliente}` : 'Conversa con el equipo de soporte'
        });
    }

    async function recargar() {
        try {
            inc = await api(`/incidentes/${id}`);
            titulo(inc.numero_ticket);
            const scroll = window.scrollY;
            const borrador = info.querySelector('#observacion')?.value; // no perder lo que se está escribiendo
            pintar();
            const campo = info.querySelector('#observacion');
            if (campo && borrador) campo.value = borrador;
            window.scrollTo(0, scroll);
        } catch (err) {
            if (err.status === 404) navegar('/incidentes');
        }
    }

    // ---------- Acciones ----------

    async function ejecutar(boton, ruta, opciones, mensajeOk) {
        await conCarga(boton, async () => {
            try {
                const r = await api(ruta, opciones);
                toast(mensajeOk || r.mensaje);
                await recargar();
            } catch (err) {
                toast(err.message, 'error');
                await recargar();
            }
        });
    }

    const acciones = {
        irChat: () => el.querySelector('#col-chat').scrollIntoView({ behavior: 'smooth' }),

        atender: boton => ejecutar(boton, `/incidentes/${id}/atender`, { method: 'POST' }),

        async cerrar(boton) {
            if (await confirmar({ titulo: 'Cerrar incidente', mensaje: 'El chat quedará en solo lectura. ¿Deseas cerrar este incidente?', textoOk: 'Cerrar incidente' })) {
                ejecutar(boton, `/incidentes/${id}/cerrar`, { method: 'POST' });
            }
        },

        async aprobar(boton) {
            if (await confirmar({ titulo: 'Aprobar servicio', mensaje: 'Confirmas que el problema fue solucionado. Se registrará la fecha y hora de aprobación.', textoOk: 'Aprobar servicio' })) {
                ejecutar(boton, `/incidentes/${id}/aprobar`, { method: 'POST' });
            }
        },

        solucionar() {
            const m = modal({
                titulo: 'Registrar solución',
                cuerpo: `
                    <label class="form-label fw-semibold" for="m-solucion">Solución aplicada</label>
                    <textarea class="form-control mb-3" id="m-solucion" rows="5" maxlength="5000" placeholder="Explica al cliente qué se hizo para resolver el incidente"></textarea>
                    <label class="form-label fw-semibold" for="m-archivos">Archivos <span class="text-muted fw-normal">(opcional, imágenes o PDF)</span></label>
                    <input type="file" class="form-control" id="m-archivos" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf">
                    <div class="form-text">Se registrará automáticamente la fecha, la hora y el tiempo de atención.</div>`,
                pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                      <button class="btn btn-success" id="m-guardar"><i class="bi bi-check2-circle"></i> Marcar como solucionado</button>`
            });
            m.el.querySelector('#m-guardar').addEventListener('click', async e => {
                const solucion = m.el.querySelector('#m-solucion').value.trim();
                if (solucion.length < 5) return toast('Describe la solución (mínimo 5 caracteres)', 'error');
                const form = new FormData();
                form.append('solucion', solucion);
                [...m.el.querySelector('#m-archivos').files].forEach(a => form.append('archivos', a));
                await conCarga(e.currentTarget, async () => {
                    try {
                        const r = await api(`/incidentes/${id}/solucion`, { method: 'POST', form });
                        m.cerrar();
                        toast(r.mensaje);
                        await recargar();
                    } catch (err) { toast(err.message, 'error'); }
                });
            });
        },

        revision() {
            const m = modal({
                titulo: 'Solicitar revisión',
                cuerpo: `<p class="text-muted">Cuéntale al programador qué sigue fallando. El incidente volverá a estar <strong>En Atención</strong>.</p>
                    <textarea class="form-control" id="m-motivo" rows="4" maxlength="2000" placeholder="Motivo de la revisión"></textarea>`,
                pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                      <button class="btn btn-danger" id="m-guardar">Solicitar revisión</button>`
            });
            m.el.querySelector('#m-guardar').addEventListener('click', async e => {
                const motivo = m.el.querySelector('#m-motivo').value.trim();
                if (motivo.length < 5) return toast('Indica el motivo (mínimo 5 caracteres)', 'error');
                await conCarga(e.currentTarget, async () => {
                    try {
                        const r = await api(`/incidentes/${id}/revision`, { method: 'POST', body: { motivo } });
                        m.cerrar();
                        toast(r.mensaje);
                        await recargar();
                    } catch (err) { toast(err.message, 'error'); }
                });
            });
        },

        async asignar() {
            const programadores = await api('/usuarios/programadores');
            const m = modal({
                titulo: 'Asignar programador',
                cuerpo: `<label class="form-label fw-semibold" for="m-prog">Programador responsable</label>
                    <select class="form-select" id="m-prog"><option value="">Sin asignar</option>
                    ${programadores.map(p => `<option value="${p.id}" ${p.id === inc.id_programador ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>`,
                pie: `<button class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                      <button class="btn btn-primary" id="m-guardar">Guardar</button>`
            });
            m.el.querySelector('#m-guardar').addEventListener('click', async e => {
                await conCarga(e.currentTarget, async () => {
                    try {
                        const r = await api(`/incidentes/${id}/asignar`, { method: 'PUT', body: { id_programador: m.el.querySelector('#m-prog').value || null } });
                        m.cerrar();
                        toast(r.mensaje);
                        await recargar();
                    } catch (err) { toast(err.message, 'error'); }
                });
            });
        }
    };

    info.addEventListener('click', async e => {
        const boton = e.target.closest('[data-accion]');
        if (boton) return acciones[boton.dataset.accion](boton);

        const descargar = e.target.closest('[data-descargar]');
        if (descargar) return descargarArchivo(descargar.dataset.descargar, descargar.dataset.nombre).catch(err => toast(err.message, 'error'));

        const ver = e.target.closest('[data-ver]');
        if (ver) {
            if (ver.dataset.mime === 'application/pdf') return abrirArchivo(ver.dataset.ver).catch(err => toast(err.message, 'error'));
            const url = await urlArchivo(ver.dataset.ver).catch(() => null);
            if (url) {
                modal({ titulo: ver.dataset.nombre, tamano: 'modal-lg', cuerpo: `<div class="text-center"><img class="visor-img" src="${url}" alt="${ver.dataset.nombre}"></div>` });
            }
            return;
        }

        if (e.target.closest('#btn-adjuntar')) return info.querySelector('#entrada-adjuntos').click();

        const estrella = e.target.closest('#estrellas button');
        if (estrella) {
            const n = Number(estrella.dataset.n);
            info.querySelector('#estrellas').dataset.valor = n;
            info.querySelectorAll('#estrellas button').forEach((b, i) => b.classList.toggle('on', i < n));
            info.querySelector('#enviar-encuesta').disabled = false;
            return;
        }

        if (e.target.closest('#enviar-encuesta')) {
            const calificacion = Number(info.querySelector('#estrellas').dataset.valor);
            const comentario = info.querySelector('#encuesta-comentario').value;
            await conCarga(e.target.closest('#enviar-encuesta'), async () => {
                try {
                    const r = await api(`/incidentes/${id}/encuesta`, { method: 'POST', body: { calificacion, comentario } });
                    toast(r.mensaje);
                    await recargar();
                } catch (err) { toast(err.message, 'error'); }
            });
        }
    });

    info.addEventListener('change', async e => {
        if (e.target.id !== 'entrada-adjuntos' || !e.target.files.length) return;
        const form = new FormData();
        [...e.target.files].forEach(a => form.append('archivos', a));
        try {
            await api(`/incidentes/${id}/archivos`, { method: 'POST', form });
            toast('Archivos adjuntados');
            await recargar();
        } catch (err) {
            toast(err.message, 'error');
            e.target.value = '';
        }
    });

    info.addEventListener('submit', async e => {
        if (e.target.id !== 'form-observacion') return;
        e.preventDefault();
        const observacion = info.querySelector('#observacion').value.trim();
        if (!observacion) return;
        await conCarga(e.target.querySelector('button'), async () => {
            try {
                await api(`/incidentes/${id}/observaciones`, { method: 'POST', body: { observacion } });
                toast('Observación registrada');
                await recargar();
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // ---------- Tiempo real ----------

    const unirse = () => socket?.emit('incidente:unirse', id);
    unirse();
    const refrescar = debounce(recargar, 400);
    const bajas = [
        alEvento('incidente:cambio', d => { if (d.id === id) refrescar(); }),
        alEvento('conexion', conectado => { if (conectado) unirse(); }),
        alEvento('reconectado', refrescar)
    ];

    pintar();

    return () => {
        bajas.forEach(b => b());
        chat?.destruir();
        socket?.emit('incidente:salir', id);
    };
}
