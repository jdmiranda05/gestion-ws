// Acceso a la API, sesión y descarga autenticada de archivos

const CLAVE = 'mesa_sesion';

export const sesion = {
    obtener() {
        try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
    },
    guardar(datos) { localStorage.setItem(CLAVE, JSON.stringify(datos)); },
    token() { return this.obtener()?.token || null; },
    usuario() { return this.obtener()?.usuario || null; },
    actualizarUsuario(cambios) {
        const s = this.obtener();
        if (s) this.guardar({ ...s, usuario: { ...s.usuario, ...cambios } });
    },
    cerrar() {
        localStorage.removeItem(CLAVE);
        blobs.clear();
        location.href = 'login.html';
    }
};

export class ApiError extends Error {
    constructor(mensaje, status) {
        super(mensaje);
        this.status = status;
    }
}

// body: objeto JSON · form: FormData · blob: true para respuestas binarias
export async function api(ruta, { method = 'GET', body, form, blob = false } = {}) {
    const headers = {};
    const token = sesion.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        payload = form;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch(`/api${ruta}`, { method, headers, body: payload });
    } catch {
        throw new ApiError('No se pudo conectar con el servidor', 0);
    }

    if (res.status === 401 && token && !ruta.startsWith('/auth/login')) {
        sesion.cerrar();
        throw new ApiError('Sesión expirada', 401);
    }
    if (!res.ok) {
        const datos = await res.json().catch(() => ({}));
        throw new ApiError(datos.error || 'Ocurrió un error inesperado', res.status);
    }
    if (blob) return res.blob();
    return res.status === 204 ? null : res.json();
}

export const qs = params => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : '';
};

// ---- Archivos protegidos: se descargan con el token y se exponen como URL local ----

const blobs = new Map();

export function urlArchivo(ruta) {
    if (!blobs.has(ruta)) {
        blobs.set(ruta, api(`/archivos/${ruta}`, { blob: true }).then(b => URL.createObjectURL(b)).catch(err => {
            blobs.delete(ruta);
            throw err;
        }));
    }
    return blobs.get(ruta);
}

export async function descargarArchivo(ruta, nombre) {
    const b = await api(`/archivos/${ruta}?descargar=1`, { blob: true });
    guardarBlob(b, nombre);
}

export function guardarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Abre el archivo en una pestaña nueva (la pestaña se abre primero para que el navegador no la bloquee)
export async function abrirArchivo(ruta) {
    const ventana = window.open('about:blank', '_blank');
    try {
        const url = await urlArchivo(ruta);
        if (ventana) ventana.location.href = url;
    } catch (err) {
        ventana?.close();
        throw err;
    }
}
