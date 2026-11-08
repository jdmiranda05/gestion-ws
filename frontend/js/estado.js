// Estado compartido de la aplicación: usuario, socket y bus de eventos entre vistas
import { sesion } from './api.js';

export const usuario = sesion.usuario();
export const esStaff = usuario?.tipo === 'staff';
export const esAdmin = usuario?.rol === 'administrador';
export const esCliente = usuario?.tipo === 'cliente';

export let socket = null;
export const fijarSocket = s => { socket = s; };

const oyentes = new Map();

// Suscribe una función a un evento; devuelve la función para cancelar la suscripción
export function alEvento(evento, fn) {
    if (!oyentes.has(evento)) oyentes.set(evento, new Set());
    oyentes.get(evento).add(fn);
    return () => oyentes.get(evento).delete(fn);
}

export function lanzar(evento, datos) {
    (oyentes.get(evento) || []).forEach(fn => fn(datos));
}

export const navegar = ruta => { location.hash = ruta; };
