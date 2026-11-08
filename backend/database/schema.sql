CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    ruc CHAR(11) NOT NULL UNIQUE,
    razon_social VARCHAR(150) NOT NULL,
    responsable VARCHAR(120) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    celular VARCHAR(20) NOT NULL,
    password VARCHAR(100) NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'activo',
    creado_en DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    usuario VARCHAR(40) NOT NULL UNIQUE,
    correo VARCHAR(150) NULL,
    password VARCHAR(100) NOT NULL,
    rol VARCHAR(15) NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'activo',
    creado_en DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidentes (
    id_incidente INT AUTO_INCREMENT PRIMARY KEY,
    numero_ticket VARCHAR(20) NULL UNIQUE,
    id_cliente INT NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    prioridad VARCHAR(20) NOT NULL,
    asunto VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    estado VARCHAR(25) NOT NULL DEFAULT 'Pendiente',
    fecha_registro DATETIME NOT NULL,
    fecha_atencion DATETIME NULL,
    fecha_solucion DATETIME NULL,
    fecha_aprobacion DATETIME NULL,
    fecha_cierre DATETIME NULL,
    id_programador INT NULL,
    solucion TEXT NULL,
    sla_limite DATETIME NOT NULL,
    revisiones INT NOT NULL DEFAULT 0,
    INDEX idx_inc_estado (estado),
    INDEX idx_inc_prioridad (prioridad),
    INDEX idx_inc_cliente (id_cliente),
    INDEX idx_inc_programador (id_programador),
    INDEX idx_inc_fecha (fecha_registro),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_programador) REFERENCES staff(id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seguimiento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_incidente INT NOT NULL,
    autor_tipo VARCHAR(10) NOT NULL,
    id_autor INT NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    observacion TEXT NULL,
    creado_en DATETIME NOT NULL,
    INDEX idx_seg_incidente (id_incidente),
    FOREIGN KEY (id_incidente) REFERENCES incidentes(id_incidente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS archivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_incidente INT NOT NULL,
    subido_por_tipo VARCHAR(10) NOT NULL,
    subido_por_nombre VARCHAR(150) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta VARCHAR(80) NOT NULL UNIQUE,
    mime VARCHAR(100) NOT NULL,
    tamano INT NOT NULL,
    creado_en DATETIME NOT NULL,
    INDEX idx_arc_incidente (id_incidente),
    FOREIGN KEY (id_incidente) REFERENCES incidentes(id_incidente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_incidente INT NOT NULL,
    autor_tipo VARCHAR(10) NOT NULL,
    id_autor INT NOT NULL,
    autor_nombre VARCHAR(150) NOT NULL,
    texto TEXT NULL,
    archivo_nombre VARCHAR(255) NULL,
    archivo_ruta VARCHAR(80) NULL UNIQUE,
    archivo_mime VARCHAR(100) NULL,
    archivo_tamano INT NULL,
    creado_en DATETIME NOT NULL,
    INDEX idx_msg_incidente (id_incidente, id),
    FOREIGN KEY (id_incidente) REFERENCES incidentes(id_incidente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_lecturas (
    id_incidente INT NOT NULL,
    lector_tipo VARCHAR(10) NOT NULL,
    id_lector INT NOT NULL,
    ultimo_id INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id_incidente, lector_tipo, id_lector),
    FOREIGN KEY (id_incidente) REFERENCES incidentes(id_incidente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS avisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    destinatario_tipo VARCHAR(10) NOT NULL,
    id_destinatario INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    mensaje VARCHAR(300) NOT NULL,
    id_incidente INT NULL,
    leido TINYINT(1) NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL,
    INDEX idx_avi_dest (destinatario_tipo, id_destinatario, leido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS encuestas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_incidente INT NOT NULL UNIQUE,
    id_cliente INT NOT NULL,
    calificacion TINYINT NOT NULL,
    comentario VARCHAR(500) NULL,
    creado_en DATETIME NOT NULL,
    FOREIGN KEY (id_incidente) REFERENCES incidentes(id_incidente) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_tipo VARCHAR(10) NOT NULL,
    id_actor INT NULL,
    actor_nombre VARCHAR(150) NOT NULL,
    accion VARCHAR(40) NOT NULL,
    entidad VARCHAR(20) NOT NULL,
    id_entidad INT NULL,
    detalle VARCHAR(500) NULL,
    ip VARCHAR(45) NULL,
    creado_en DATETIME NOT NULL,
    INDEX idx_aud_fecha (creado_en),
    INDEX idx_aud_accion (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cuenta_tipo VARCHAR(10) NOT NULL,
    id_cuenta INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expira_en DATETIME NOT NULL,
    usado TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
