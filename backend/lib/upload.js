const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { error } = require('./http');
const { UPLOADS } = require('../config');

const DIRECTORIO = path.join(__dirname, '../uploads');
fs.mkdirSync(DIRECTORIO, { recursive: true });

// Solo imágenes y PDF (según requerimiento). La extensión la define el tipo detectado, no el nombre enviado.
const TIPOS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
};

const FIRMAS = {
    'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/gif': b => b.subarray(0, 4).toString('latin1') === 'GIF8',
    'image/webp': b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
    'application/pdf': b => b.subarray(0, 5).toString('latin1') === '%PDF-'
};

const almacenamiento = multer.diskStorage({
    destination: DIRECTORIO,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS[file.mimetype] || ''))
});

const multerBase = multer({
    storage: almacenamiento,
    limits: { fileSize: UPLOADS.maxBytes, files: UPLOADS.maxPorIncidente },
    fileFilter: (req, file, cb) => {
        if (TIPOS[file.mimetype]) return cb(null, true);
        cb(error(400, 'Solo se permiten imágenes (JPG, PNG, GIF, WEBP) y archivos PDF'));
    }
});

function borrar(archivos) {
    for (const f of archivos) fs.unlink(f.path, () => {});
}

// Comprueba la firma real del archivo para evitar contenido disfrazado
function firmaValida(archivo) {
    const fd = fs.openSync(archivo.path, 'r');
    try {
        const buf = Buffer.alloc(12);
        fs.readSync(fd, buf, 0, 12, 0);
        return FIRMAS[archivo.mimetype](buf);
    } finally {
        fs.closeSync(fd);
    }
}

// Normaliza el nombre original (multer lo entrega en latin1)
const nombreOriginal = archivo => Buffer.from(archivo.originalname, 'latin1').toString('utf8').slice(0, 200);

// Middleware: sube uno o varios archivos en `campo` y valida su contenido.
// Deja los archivos en req.archivos = [{ nombre, ruta, mime, tamano }]
function subir(campo, { multiple = false } = {}) {
    const handler = multiple
        ? multerBase.array(campo, UPLOADS.maxPorIncidente)
        : multerBase.single(campo);

    return (req, res, next) => {
        handler(req, res, err => {
            const recibidos = multiple ? (req.files || []) : (req.file ? [req.file] : []);
            if (err) {
                borrar(recibidos);
                return next(err);
            }
            if (recibidos.some(f => !firmaValida(f))) {
                borrar(recibidos);
                return next(error(400, 'El contenido de un archivo no coincide con su tipo'));
            }
            req.archivos = recibidos.map(f => ({
                nombre: nombreOriginal(f),
                ruta: f.filename,
                mime: f.mimetype,
                tamano: f.size,
                path: f.path
            }));
            next();
        });
    };
}

const quitarArchivos = archivos => borrar(archivos || []);
const rutaArchivo = ruta => path.join(DIRECTORIO, ruta);

module.exports = { subir, quitarArchivos, rutaArchivo };
