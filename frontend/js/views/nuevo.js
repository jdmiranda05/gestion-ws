import { api } from '../api.js';
import { navegar } from '../estado.js';
import { esc, fmtTamano, toast, conCarga } from '../ui.js';

const TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ARCHIVOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

const textoSla = h => (h === 1 ? 'Respuesta en 1 hora' : h < 24 ? `Respuesta en ${h} horas` : `Respuesta en ${h / 24} día${h > 24 ? 's' : ''}`);
const DESCRIPCION_PRIORIDAD = {
    'Muy Urgente': 'El sistema no funciona y detiene tu operación.',
    'Urgente': 'Falla importante, pero puedes trabajar parcialmente.',
    'No Muy Urgente': 'Molestia o error que no bloquea tu trabajo.',
    'Largo Plazo': 'Mejora o consulta sin fecha límite.'
};

export async function montar(el) {
    const cat = await api('/incidentes/catalogos');
    let archivos = [];
    const urls = [];

    el.innerHTML = `
        <form class="tarjeta mx-auto" style="max-width: 860px" id="form" novalidate>
            <div class="tarjeta-cabecera"><i class="bi bi-plus-circle text-primary"></i> Registrar incidente</div>
            <div class="tarjeta-cuerpo">
                <div class="row g-3">
                    <div class="col-md-5">
                        <label class="form-label fw-semibold" for="tipo">Tipo de incidente</label>
                        <select class="form-select" id="tipo" required>${cat.tipos.map(t => `<option>${esc(t)}</option>`).join('')}</select>
                    </div>
                    <div class="col-md-7">
                        <label class="form-label fw-semibold" for="asunto">Asunto</label>
                        <input class="form-control" id="asunto" maxlength="200" placeholder="Resume el problema en una frase" required>
                    </div>
                    <div class="col-12">
                        <label class="form-label fw-semibold" id="etiqueta-prioridad">Prioridad</label>
                        <div class="row g-2" role="radiogroup" aria-labelledby="etiqueta-prioridad">
                            ${cat.prioridades.map((p, i) => `
                                <div class="col-sm-6 col-lg-3">
                                    <label class="prio-opcion">
                                        <input type="radio" name="prioridad" value="${esc(p.nombre)}" ${i === 1 ? 'checked' : ''}>
                                        <div class="caja">
                                            <div class="fw-semibold mb-1">${esc(p.nombre)}</div>
                                            <div class="small text-muted mb-2">${esc(DESCRIPCION_PRIORIDAD[p.nombre] || '')}</div>
                                            <div class="small fw-semibold text-primary"><i class="bi bi-clock"></i> ${textoSla(p.slaHoras)}</div>
                                        </div>
                                    </label>
                                </div>`).join('')}
                        </div>
                    </div>
                    <div class="col-12">
                        <label class="form-label fw-semibold" for="descripcion">Descripción</label>
                        <textarea class="form-control" id="descripcion" rows="6" maxlength="5000" required
                            placeholder="¿Qué ocurrió? ¿Qué estabas haciendo? ¿Aparece algún mensaje de error?"></textarea>
                    </div>
                    <div class="col-12">
                        <label class="form-label fw-semibold">Adjuntos <span class="text-muted fw-normal">(opcional · imágenes o PDF, hasta ${MAX_ARCHIVOS} archivos de 10 MB)</span></label>
                        <div class="zona-archivos" id="zona" tabindex="0" role="button">
                            <i class="bi bi-cloud-arrow-up"></i>
                            Arrastra archivos aquí o <span class="text-primary fw-semibold">haz clic para seleccionarlos</span>
                        </div>
                        <input type="file" id="archivos" class="d-none" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf">
                        <div class="lista-previas" id="previas"></div>
                    </div>
                </div>
            </div>
            <div class="px-3 py-3 border-top d-flex justify-content-end gap-2">
                <a href="#/incidentes" class="btn btn-light">Cancelar</a>
                <button class="btn btn-primary" type="submit"><i class="bi bi-send"></i> Registrar incidente</button>
            </div>
        </form>`;

    const $ = id => el.querySelector(id);
    const zona = $('#zona');
    const entrada = $('#archivos');

    function pintarPrevias() {
        urls.splice(0).forEach(u => URL.revokeObjectURL(u));
        $('#previas').innerHTML = archivos.map((a, i) => {
            let miniatura = '<div class="previa-icono"><i class="bi bi-file-earmark-pdf"></i></div>';
            if (a.type.startsWith('image/')) {
                const url = URL.createObjectURL(a);
                urls.push(url);
                miniatura = `<img src="${url}" alt="">`;
            }
            return `<div class="previa">${miniatura}
                <div class="min-w-0"><div class="previa-nombre">${esc(a.name)}</div><small class="text-muted">${fmtTamano(a.size)}</small></div>
                <button class="quitar" type="button" data-i="${i}" aria-label="Quitar ${esc(a.name)}"><i class="bi bi-x-lg"></i></button></div>`;
        }).join('');
    }

    function agregar(lista) {
        for (const a of lista) {
            if (!TIPOS.includes(a.type)) { toast(`"${a.name}": solo se permiten imágenes y PDF`, 'error'); continue; }
            if (a.size > MAX_BYTES) { toast(`"${a.name}" supera los 10 MB`, 'error'); continue; }
            if (archivos.length >= MAX_ARCHIVOS) { toast(`Máximo ${MAX_ARCHIVOS} archivos`, 'error'); break; }
            archivos.push(a);
        }
        pintarPrevias();
    }

    zona.addEventListener('click', () => entrada.click());
    zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } });
    entrada.addEventListener('change', () => { agregar([...entrada.files]); entrada.value = ''; });
    zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
    zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); agregar([...e.dataTransfer.files]); });
    $('#previas').addEventListener('click', e => {
        const b = e.target.closest('.quitar');
        if (b) { archivos.splice(Number(b.dataset.i), 1); pintarPrevias(); }
    });

    $('#form').addEventListener('submit', async e => {
        e.preventDefault();
        const asunto = $('#asunto').value.trim();
        const descripcion = $('#descripcion').value.trim();
        if (asunto.length < 5) return toast('El asunto debe tener al menos 5 caracteres', 'error');
        if (descripcion.length < 10) return toast('Describe el problema con al menos 10 caracteres', 'error');

        const form = new FormData();
        form.append('tipo', $('#tipo').value);
        form.append('prioridad', el.querySelector('input[name="prioridad"]:checked').value);
        form.append('asunto', asunto);
        form.append('descripcion', descripcion);
        archivos.forEach(a => form.append('archivos', a));

        await conCarga(e.submitter || $('button[type="submit"]'), async () => {
            try {
                const r = await api('/incidentes', { method: 'POST', form });
                toast(`Incidente ${r.numero_ticket} registrado`);
                navegar(`/incidentes/${r.id}`);
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    });

    return () => urls.forEach(u => URL.revokeObjectURL(u));
}
