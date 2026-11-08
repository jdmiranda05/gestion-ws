const multer = require('multer');

const MENSAJES_MULTER = {
    LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo de 10 MB',
    LIMIT_FILE_COUNT: 'Demasiados archivos adjuntos',
    LIMIT_UNEXPECTED_FILE: 'Campo de archivo no esperado'
};

function noEncontrado(req, res) {
    res.status(404).json({ error: 'Recurso no encontrado' });
}

// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: MENSAJES_MULTER[err.code] || 'Error al subir el archivo' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Solicitud con formato no válido' });
    }
    if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
    }
    console.error(`${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { noEncontrado, manejarErrores };
