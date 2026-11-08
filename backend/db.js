require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: 'local'
});

async function query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

// Ejecuta varias operaciones atómicamente. `fn` recibe una función query ligada a la transacción.
async function transaccion(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const q = async (sql, params = []) => (await conn.query(sql, params))[0];
        const resultado = await fn(q);
        await conn.commit();
        return resultado;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Crea las tablas si no existen y siembra el administrador inicial.
async function iniciar() {
    const schema = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
    for (const sentencia of schema.split(';').map(s => s.trim()).filter(Boolean)) {
        await pool.query(sentencia);
    }

    const [{ total }] = await query('SELECT COUNT(*) AS total FROM staff');
    if (total === 0) {
        const usuario = process.env.ADMIN_USER || 'admin';
        const generada = !process.env.ADMIN_PASSWORD;
        const clave = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
        await query(
            'INSERT INTO staff (nombre, usuario, password, rol, estado, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
            ['Administrador', usuario, await bcrypt.hash(clave, 10), 'administrador', 'activo', new Date()]
        );
        console.log(`Administrador inicial creado. Usuario: ${usuario}`);
        if (generada) {
            console.log(`Contraseña generada (cámbiala al ingresar): ${clave}`);
        }
    }
}

module.exports = { pool, query, transaccion, iniciar };
