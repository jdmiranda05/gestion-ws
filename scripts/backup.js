// Copia de seguridad de la base de datos con mysqldump.
// Uso: npm run backup   (genera backups/<db>-<fecha>.sql y conserva las últimas BACKUP_KEEP copias)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const destino = path.resolve(__dirname, '../backups');
fs.mkdirSync(destino, { recursive: true });

const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const archivo = path.join(destino, `${process.env.DB_NAME}-${sello}.sql`);
const salida = fs.createWriteStream(archivo);

const dump = spawn(process.env.MYSQLDUMP_PATH || 'mysqldump', [
    `--host=${process.env.DB_HOST}`,
    `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER}`,
    '--single-transaction',
    '--routines',
    process.env.DB_NAME
], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' } });

dump.stdout.pipe(salida);
dump.stderr.on('data', d => process.stderr.write(d));
dump.on('error', err => {
    console.error(`No se pudo ejecutar mysqldump (${err.message}). Define MYSQLDUMP_PATH en el .env con la ruta completa.`);
    fs.unlink(archivo, () => process.exit(1));
});
dump.on('close', codigo => {
    if (codigo !== 0) {
        console.error(`mysqldump terminó con código ${codigo}`);
        return fs.unlink(archivo, () => process.exit(1));
    }
    console.log(`Copia creada: ${archivo}`);
    const conservar = Number(process.env.BACKUP_KEEP) || 14;
    const copias = fs.readdirSync(destino).filter(f => f.endsWith('.sql')).sort();
    copias.slice(0, Math.max(0, copias.length - conservar)).forEach(f => fs.unlinkSync(path.join(destino, f)));
});
