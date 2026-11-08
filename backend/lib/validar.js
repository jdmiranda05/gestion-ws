const { error } = require('./http');

const texto = (valor, nombre, { min = 1, max = 255, opcional = false } = {}) => {
    const v = typeof valor === 'string' ? valor.trim() : '';
    if (!v) {
        if (opcional) return null;
        throw error(400, `${nombre} es obligatorio`);
    }
    if (v.length < min) throw error(400, `${nombre} debe tener al menos ${min} caracteres`);
    if (v.length > max) throw error(400, `${nombre} no puede superar ${max} caracteres`);
    return v;
};

const ruc = valor => {
    const v = String(valor || '').trim();
    if (!/^\d{11}$/.test(v)) throw error(400, 'El RUC debe tener 11 dígitos');
    return v;
};

const correo = (valor, opcional = false) => {
    const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
    if (!v && opcional) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 150) throw error(400, 'Correo electrónico no válido');
    return v;
};

const celular = valor => {
    const v = String(valor || '').replace(/[\s-]/g, '');
    if (!/^\+?\d{7,15}$/.test(v)) throw error(400, 'Celular no válido (solo dígitos, 7 a 15)');
    return v;
};

const password = valor => {
    if (typeof valor !== 'string' || valor.length < 8) throw error(400, 'La contraseña debe tener al menos 8 caracteres');
    if (valor.length > 72) throw error(400, 'La contraseña es demasiado larga');
    if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) throw error(400, 'La contraseña debe combinar letras y números');
    return valor;
};

const entero = (valor, nombre) => {
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) throw error(400, `${nombre} no válido`);
    return n;
};

const opcion = (valor, lista, nombre) => {
    if (!lista.includes(valor)) throw error(400, `${nombre} no válido`);
    return valor;
};

const pagina = (query, porDefecto = 15) => {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || porDefecto));
    return { page, limit, offset: (page - 1) * limit };
};

// Escapa comodines de LIKE para búsquedas literales
const like = v => `%${String(v).replace(/[\\%_]/g, '\\$&')}%`;

module.exports = { texto, ruc, correo, celular, password, entero, opcion, pagina, like };
