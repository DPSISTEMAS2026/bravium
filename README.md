# DP Sistemas - Plataforma Multi-Tenant de Gestión Financiera

Sistema SaaS desarrollado con NestJS (Backend) y Next.js (Frontend) para la gestión contable, conciliación bancaria inteligente, integración con LibreDTE y procesamiento automático de cartolas bancarias mediante IA.

## 🏗️ Estructura del Proyecto

```
DP-SISTEMAS/
├── apps/               
│   └── web/            # Aplicación frontend Next.js (Branding Dinámico)
├── src/                # Código fuente del backend NestJS
├── prisma/             # Esquema de base de datos y migraciones
├── scripts/            # Scripts de utilidad (organizados)
│   ├── db/             # Migraciones y seeds
│   └── tenants/        # Operaciones por cliente
├── docs/               # Documentación y arquitectura
└── data/               # Archivos de datos temporales (no versionados)
```

## 🚀 Arquitectura Multi-Tenant

El sistema opera bajo un modelo de **tenant lógico por base de datos única (Row-Level Tenancy)**.
- **`Organization`**: Es la entidad raíz. Cada cliente (ej: Bravium) es un registro aquí.
- **Acceso Dinámico**: Los subdominios determinan qué organización se carga (ej: `bravium.dpsistemas.cl`).
- **Seguridad**: Todos los registros financieros están vinculados a un `organizationId`. El backend garantiza mediante el JWT de sesión que un usuario solo pueda ver u operar sobre los datos de su organización.

Documentación de arquitectura en: [`docs/architecture/multi-tenancy.md`](docs/architecture/multi-tenancy.md)

## 🚀 Inicio Rápido

### Instalación General
```bash
npm install
cd apps/web && npm install
```

### Desarrollo Local (Ejecutar ambos servicios)
Backend (Puerto 3000):
```bash
npm run start:dev
```
Frontend (Puerto 3001):
```bash
cd apps/web
npm run dev
```

> **Ingreso local**: Visita `http://localhost:3001/login?tenant=bravium` para cargar con el contexto del tenant Bravium.

## 📁 Directorios Principales

### `/src` - Backend NestJS (API Multi-tenant)
Contiene la lógica core SaaS:
- `modules/organizations`: Gestión de clientes (branding, configuración).
- `modules/auth`: Autenticación segura unificada.
- `modules/conciliacion`: Motor inteligente de matching.
- `modules/ingestion`: Integraciones externas (LibreDTE, Drive, correos).

### `/apps/web` - Frontend Next.js
Interfaz administrativa unificada. El renderizado estético se adapta a cada cliente usando variables de entorno pasadas desde la API al momento de inicio de sesión.

### `/prisma` - Base de Datos Postgres
- `schema.prisma`: Esquema de la base de datos (PostgreSQL).
Generación del cliente: `npx prisma generate`.

## 🤖 Capacidades e Integraciones

1. **LibreDTE**: 
   Cada organización guarda sus credenciales (`libreDteApiKey`, `libreDteRut`) encriptadas en la BD. El sistema obtiene facturas y notas de crédito de manera autónoma.
2. **Google Drive OCR / OpenAI**: 
   Los bancos envían las cartolas en PDF a correos conectados o subidos a carpetas compartidas Drive (una por tenant). El motor las ingesta usando Visión IA y mapea las líneas de transacción al modelo `BankTransaction`.
3. **Motor de Conciliación**: 
   Apareamiento avanzado exacto y difuso de montos y RUTs para conectar DTEs (o registros de compras) con Movimientos Bancarios.

## 📄 Licencia

Software Comercial Privado - Uso restringido a DP Sistemas y sus afiliados.

---
**DP Sistemas Team** © 2026
