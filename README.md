# BRAVIUM - Sistema de Conciliación Bancaria y Contabilidad

Sistema backend desarrollado con NestJS para la gestión de conciliación bancaria, integración con LibreDTE y procesamiento automático de cartolas bancarias.

## 🏗️ Estructura del Proyecto

```
BRAVIUM-PRODUCCION/
├── apps/           # Aplicaciones adicionales (Owner, Admin, Kitchen panels)
├── frontend/       # Aplicación frontend
├── src/            # Código fuente del backend (NestJS)
├── prisma/         # Esquema de base de datos y migraciones
├── scripts/        # Scripts de utilidad y debugging
├── workflows/      # Workflows de automatización N8N
├── data/           # Archivos de datos (CSV, JSON) - no versionados
└── logo.svg        # Logo del proyecto
```

## 🚀 Inicio Rápido

### Instalación
```bash
npm install
```

### Desarrollo
```bash
npm run start:dev
```

### Producción
```bash
npm run build
npm run start:prod
```

## 📁 Directorios Principales

### `/src` - Backend NestJS
Contiene el código fuente del backend con arquitectura modular:
- Módulos de autenticación
- Controladores de API
- Servicios de negocio
- Integraciones con servicios externos

### `/apps` - Aplicaciones del Sistema
Aplicaciones complementarias del ecosistema BRAVIUM:
- **Owner Panel**: Panel de administración para dueños
- **Admin Panel**: Panel administrativo
- **Kitchen Panel**: Panel para gestión de cocina

### `/frontend` - Aplicación Frontend
Interfaz de usuario principal del sistema.

### `/prisma` - Base de Datos
- `schema.prisma`: Esquema de la base de datos
- Migraciones y seeds

### `/scripts` - Utilidades
Scripts para operaciones manuales y debugging:
- `upload_dtes_prod.js`: Carga manual de DTEs
- `trigger_match.js`: Dispara matching de conciliación
- `check_tx.ts`: Verifica transacciones
- `check_matches.ts`: Verifica matches
- `debug_matches.ts`: Debug de matching

Ver [scripts/README.md](scripts/README.md) para más detalles.

### `/workflows` - Automatización N8N
Workflows de automatización:
- `bank-statement-processor.json`: Procesamiento automático de cartolas bancarias con OpenAI

Ver [workflows/README.md](workflows/README.md) para más detalles.

### `/data` - Datos
Archivos de datos para importación (no versionados):
- CSVs de DTEs
- Datos de testing

## 🔧 Tecnologías

- **Backend**: NestJS + TypeScript
- **Base de Datos**: PostgreSQL + Prisma ORM
- **Autenticación**: JWT + Passport
- **Automatización**: N8N
- **IA**: OpenAI GPT-4o (procesamiento de cartolas)
- **Integraciones**: 
  - **LibreDTE API**: Sincronización automática de DTEs recibidos
  - **Google Drive**: Procesamiento de cartolas bancarias

## 🔗 Integración con LibreDTE

BRAVIUM se integra con LibreDTE para extraer automáticamente los DTEs (Documentos Tributarios Electrónicos) recibidos y realizar matching con las transacciones bancarias.

### Configuración

1. **Obtén tus credenciales de LibreDTE**:
   - Ve a https://libredte.cl/usuarios/perfil
   - Copia tu **API key** (ya está en formato Base64)
   - Anota el RUT de tu empresa

2. **Configura las variables de entorno**:
   ```bash
   # Copia el archivo de ejemplo
   cp .env.example .env
   
   # Edita .env y configura:
   LIBREDTE_API_KEY="tu_api_key_aqui"
   COMPANY_RUT="tu_rut_sin_dv"
   ```

### Sincronización de DTEs

#### Opción 1: Mediante API (Recomendado)

```bash
# Sincronizar DTEs de un rango de fechas
curl -X POST http://localhost:3000/ingestion/libredte/sync \
  -H "Content-Type: application/json" \
  -d '{
    "fromDate": "2026-01-01",
    "toDate": "2026-02-11"
  }'
```

#### Opción 2: Mediante Script

```bash
# Sincronizar últimos 30 días
node scripts/sync_libredte_dtes.js

# Sincronizar rango específico
node scripts/sync_libredte_dtes.js 2026-01-01 2026-02-11
```

#### Opción 3: Prueba Directa de API

```bash
# Probar conexión con LibreDTE directamente
node scripts/fetch_libredte_data.js
```

### Proceso de Sincronización

1. **Extracción**: Se consulta la API de LibreDTE para obtener DTEs recibidos
2. **Validación**: Se validan los datos recibidos
3. **Proveedores**: Se crean/actualizan los proveedores automáticamente
4. **DTEs**: Se guardan los DTEs en la base de datos
5. **Matching**: El sistema de conciliación busca matches con transacciones bancarias

### Endpoints de Integración

- `POST /ingestion/libredte/sync` - Sincronizar DTEs
- `POST /ingestion/cartolas/drive` - Procesar cartola desde Drive
- `POST /ingestion/manual/dtes-csv` - Cargar DTEs desde CSV
- `GET /ingestion/ping` - Verificar estado del servicio



## 📝 Scripts Disponibles

```bash
# Desarrollo
npm run start:dev      # Inicia servidor en modo desarrollo

# Producción
npm run build          # Compila el proyecto
npm run start:prod     # Inicia servidor en producción

# Calidad de código
npm run format         # Formatea código con Prettier
npm run lint           # Ejecuta ESLint

# Utilidades
npx ts-node scripts/check_tx.ts        # Verifica transacciones
npx ts-node scripts/check_matches.ts   # Verifica matches
npx ts-node scripts/debug_matches.ts   # Debug de matching
node scripts/upload_dtes_prod.js       # Carga DTEs a producción
node scripts/trigger_match.js          # Dispara auto-matching
```

## 🌐 Endpoints de Producción

- **Backend**: `https://bravium-backend.onrender.com`
- **Ingestion**: `/ingestion/cartolas/drive`
- **Conciliación**: `/conciliacion/run-auto-match`

## 📦 Dependencias Principales

- `@nestjs/core` - Framework backend
- `@prisma/client` - ORM para base de datos
- `@nestjs/jwt` - Autenticación JWT
- `bcrypt` - Encriptación de contraseñas
- `class-validator` - Validación de DTOs
- `xlsx` - Procesamiento de archivos Excel

## 🔐 Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
LIBREDTE_API_TOKEN="..."
# ... otras variables
```

## 📄 Licencia

UNLICENSED - Uso privado

---

**Bravium Team** © 2026
