const nodemailer = require('nodemailer');

let transporte = null;
if (process.env.SMTP_HOST) {
    transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
    });
}

const habilitado = () => Boolean(transporte);

// Envía un correo si hay SMTP configurado; si no, no hace nada.
async function enviar(para, asunto, texto) {
    if (!transporte || !para) return false;
    try {
        await transporte.sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to: para,
            subject: asunto,
            text: texto
        });
        return true;
    } catch (err) {
        console.error('Error enviando correo:', err.message);
        return false;
    }
}

module.exports = { enviar, habilitado };
