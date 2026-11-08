// Reglas de negocio del sistema (según el documento de requerimientos)
const PRIORIDADES = [
    { nombre: 'Muy Urgente', slaHoras: 1 },
    { nombre: 'Urgente', slaHoras: 4 },
    { nombre: 'No Muy Urgente', slaHoras: 24 },
    { nombre: 'Largo Plazo', slaHoras: 72 }
];

const ESTADOS = ['Pendiente', 'En Atención', 'Solucionado', 'Aprobado por Cliente', 'Cerrado'];

const TIPOS_INCIDENTE = [
    'Error del sistema',
    'Consulta técnica',
    'Solicitud de cambio',
    'Acceso / Usuarios',
    'Reportes',
    'Otro'
];

const ROLES_STAFF = ['programador', 'administrador'];

const UPLOADS = {
    maxBytes: 10 * 1024 * 1024,
    maxPorIncidente: 5
};

if (!process.env.JWT_SECRET) {
    throw new Error('Falta JWT_SECRET en el archivo .env');
}

module.exports = { PRIORIDADES, ESTADOS, TIPOS_INCIDENTE, ROLES_STAFF, UPLOADS };
