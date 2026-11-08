const { error } = require('../lib/http');

// Limitador simple en memoria por IP (suficiente para una instancia única)
function limitar({ max, ventanaMs, mensaje }) {
    const intentos = new Map();

    setInterval(() => {
        const ahora = Date.now();
        for (const [clave, reg] of intentos) if (reg.reinicio < ahora) intentos.delete(clave);
    }, ventanaMs).unref();

    return (req, res, next) => {
        const ahora = Date.now();
        let reg = intentos.get(req.ip);
        if (!reg || reg.reinicio < ahora) {
            reg = { cuenta: 0, reinicio: ahora + ventanaMs };
            intentos.set(req.ip, reg);
        }
        if (++reg.cuenta > max) throw error(429, mensaje || 'Demasiados intentos, espera unos minutos');
        next();
    };
}

module.exports = { limitar };
