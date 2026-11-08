# Mesa de Ayuda — Sistema web de gestión de incidentes

Sistema para que los **clientes** registren incidentes de soporte técnico, los clasifiquen por urgencia y les den seguimiento hasta su solución, con historial completo, chat dentro de cada ticket y reportes para el equipo de soporte.

Implementa el documento de requerimientos *"Sistema web de gestión de incidentes para clientes"*.

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Acceso** | Ingreso con **RUC + contraseña** (clientes) o usuario (programadores/administradores). El sistema reconoce el rol automáticamente. Los clientes **no se registran solos**: el administrador los da de alta (su usuario es el RUC) y les entrega la contraseña. Cada cliente puede cambiarla desde *Mi cuenta*; también hay recuperación por correo. |
| **Clientes** (admin) | Registrar (con generador de contraseña), editar, desactivar y buscar clientes (RUC, razón social, responsable, correo, celular, estado). |
| **Usuarios** (admin) | Alta y administración de programadores y administradores. |
| **Incidentes** | Número de ticket automático (`INC-2026-00001`), fecha y hora automáticas, tipo, descripción, adjuntos (imágenes y PDF) y prioridad: **Muy Urgente, Urgente, No Muy Urgente, Largo Plazo**. |
| **Estados** | `Pendiente → En Atención → Solucionado → Aprobado por Cliente → Cerrado`. El cliente puede **aprobar** el servicio o **solicitar revisión** (vuelve a *En Atención*). |
| **Programador** | Dashboard con indicadores, filtros, cambio de estado, observaciones, registro de solución con archivos. Registra automáticamente fecha/hora de solución y tiempos de atención. |
| **Historial** | Cada ticket conserva creación, atención, solución, aprobación, cierre, programador y cliente que aprobó, además de cada observación. |
| **Chat del ticket** | Conversación cliente ↔ programador en tiempo real, con envío de imágenes y PDF (ver abajo). |
| **SLA** | Tiempo máximo de primera respuesta por prioridad: 1 h, 4 h, 24 h y 72 h, con indicador de cumplimiento. |
| **Notificaciones** | Aviso inmediato en la campana (y toast) al programador por cada incidente nuevo y al cliente por cada cambio de estado; correo opcional si se configura SMTP. |
| **Reportes** | Incidentes por cliente, prioridad, programador y mes; tiempo promedio de atención y de solución; abiertos/cerrados; SLA; satisfacción. **Exportación a Excel y PDF**. |
| **Encuesta** | Tras aprobar, el cliente califica la atención de 1 a 5 estrellas. |
| **Asignación** | El administrador puede asignar cada incidente a un programador. |
| **Auditoría** | Bitácora de quién hizo qué y cuándo (accesos, cambios de estado, altas, exportaciones…). |

### Chat con imágenes

- Mensajes en tiempo real (Socket.IO) con indicador de "escribiendo…" y contador de mensajes sin leer en la lista de incidentes.
- Adjuntar **imagen o PDF** con el clip, **arrastrando** el archivo al chat o **pegando** una captura (Ctrl+V). Vista previa antes de enviar.
- Las imágenes se ven dentro de la conversación y se amplían al hacer clic; los PDF se abren o descargan.
- Mensajes agrupados por persona y por día, carga de mensajes anteriores y recuperación automática tras perder la conexión.
- Al cerrar el incidente el chat queda en solo lectura.
- Los archivos **no son públicos**: solo los ve el personal o el cliente dueño del ticket. Se valida el tipo real del archivo (no solo la extensión) y el máximo es 10 MB.

## Tecnologías

- **Backend:** Node.js, Express 5, MySQL (`mysql2`), JWT, **bcrypt**, Socket.IO, Multer, ExcelJS, PDFKit, Nodemailer (opcional).
- **Frontend:** HTML + JavaScript (módulos ES), **Bootstrap 5**, Bootstrap Icons, Chart.js. Responsive para PC, tablet y celular.

> El documento permite Flask o Laravel "según preferencia"; este proyecto ya estaba construido sobre Node/Express y se mantuvo esa base.

## Instalación

Requisitos: Node.js 18+ y MySQL 8.

1. Crea una base de datos vacía (por ejemplo `mesa_ayuda`).
2. Instala dependencias y configura el entorno:

   ```bash
   npm install
   cp .env.example .env   # y completa DB_*, JWT_SECRET
   ```

3. Inicia el servidor (las tablas se crean solas la primera vez):

   ```bash
   npm start        # o: npm run dev  (con recarga automática)
   ```

4. Abre **http://localhost:3000**.

En el primer arranque se crea el administrador inicial (usuario `ADMIN_USER`, por defecto `admin`). Si no defines `ADMIN_PASSWORD` en el `.env`, se genera una contraseña aleatoria y se muestra **una sola vez** en la consola. Desde ahí, crea a los programadores en *Usuarios*; los clientes los crea el administrador en *Clientes*.

### Variables de entorno

Ver [.env.example](.env.example). Las obligatorias son `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET`. Opcionales: `SMTP_*` / `MAIL_FROM` (correos y recuperación de contraseña), `APP_URL`, `MYSQLDUMP_PATH`.

Sin SMTP el sistema funciona igual; el enlace de recuperación de contraseña se imprime en la consola del servidor (solo fuera de producción).

### Copias de seguridad

```bash
npm run backup
```

Genera `backups/<base>-<fecha>.sql` con `mysqldump` y conserva las últimas 14 copias (`BACKUP_KEEP`). Prográmalo con el Programador de tareas de Windows o `cron`.

## Estructura

```
backend/
  server.js            Arranque (Express + Socket.IO)
  config.js            Prioridades, SLA, estados y tipos de incidente
  db.js                Pool MySQL, transacciones y creación de tablas
  database/schema.sql  Modelo de datos
  routes/              auth, clientes, usuarios, incidentes (+chat), archivos, avisos, reportes, auditoria
  lib/                 validaciones, subida segura, notificaciones, correo, reportes, auditoría
  middleware/          autenticación/roles, limitador de intentos, errores
frontend/
  login.html           Ingreso, registro y recuperación
  index.html           Aplicación (menú según rol)
  js/                  app (enrutador), chat, api, ui y views/ (una por pantalla)
  css/app.css
scripts/backup.js
```

## Notas de diseño

- Las fechas y horas se guardan como `DATETIME` único (se muestran separadas en pantalla).
- Un incidente solucionado pasa a *Aprobado por Cliente* cuando el cliente lo aprueba; el personal lo marca *Cerrado* después. Una revisión solicitada borra la fecha de solución vigente (queda registrada en el historial) y suma al contador de revisiones.
- Contraseñas con bcrypt, sesiones JWT de 8 h, límite de solicitudes en la recuperación de contraseña y validación de permisos en cada endpoint (un cliente solo accede a sus incidentes y archivos).
- Las tablas antiguas del sistema anterior (`usuarios`, `tickets`, `comentarios`, `notificaciones`, `adjuntos`, `tecnicos`) no se tocan ni se usan; puedes eliminarlas cuando lo desees.
