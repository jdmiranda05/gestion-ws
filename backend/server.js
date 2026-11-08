require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http = require('http');
const path = require('path');
const express = require('express');
const db = require('./db');
const socket = require('./socket');
const { noEncontrado, manejarErrores } = require('./middleware/errores');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    next();
});
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/incidentes', require('./routes/incidentes'));
app.use('/api/archivos', require('./routes/archivos'));
app.use('/api/avisos', require('./routes/avisos'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api', noEncontrado);

app.use(express.static(path.join(__dirname, '../frontend')));
app.use(manejarErrores);

const PORT = process.env.PORT || 3000;
const servidor = http.createServer(app);
socket.iniciar(servidor);

db.iniciar()
    .then(() => servidor.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`)))
    .catch(err => {
        console.error('No se pudo iniciar la base de datos:', err.message);
        process.exit(1);
    });
