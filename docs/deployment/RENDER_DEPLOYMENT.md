# 🚀 Despliegue en Render - Sistema de Filtros 2025

## 📋 Resumen

Este documento describe cómo desplegar las nuevas funcionalidades del sistema de filtros 2025 en Render, que tiene 3 servicios:
1. **Backend** (NestJS)
2. **Web** (Frontend Next.js)
3. **API** (?)

---

## ✅ Cambios Realizados

### Backend (NestJS)
- ✅ Nuevos DTOs de filtros con validación
- ✅ Servicio de exportación a Excel (ExportService)
- ✅ Endpoints actualizados con filtros avanzados
- ✅ Nueva dependencia: `exceljs`

### Scripts
- ✅ Script de carga masiva: `load_all_2025_dtes.js`
- ✅ Scripts de diagnóstico y verificación

### Documentación
- ✅ Guías de uso y documentación técnica

---

## 🔧 Pasos de Despliegue

### 1. **Verificar que el Push fue Exitoso**

```bash
# El código ya fue pusheado a GitHub
git log -1
# Debe mostrar: "feat: Sistema de filtros avanzados 2025 y exportación a Excel"
```

✅ **Completado**: Commit `72b8842` pusheado a `origin/master`

### 2. **Render Auto-Deploy**

Render debería detectar automáticamente el nuevo commit y comenzar el despliegue. Verifica en:

**Dashboard de Render**: https://dashboard.render.com

#### Servicios a Monitorear:

##### 🔹 Backend Service
- **Nombre**: `bravium-backend` (o similar)
- **Tipo**: Web Service
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start:prod`

**Verificar**:
1. ✅ Build exitoso
2. ✅ Instalación de `exceljs` correcta
3. ✅ Servicio corriendo sin errores

##### 🔹 Web Service (Frontend)
- **Nombre**: `bravium-web` (o similar)
- **Tipo**: Static Site o Web Service
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`

**Verificar**:
1. ✅ Build exitoso
2. ✅ Variables de entorno configuradas

##### 🔹 API Service
- **Nombre**: `bravium-api` (o similar)
- Verificar si este servicio necesita actualizaciones

### 3. **Variables de Entorno**

Asegúrate de que estas variables estén configuradas en Render:

#### Backend Service
```env
# Base de datos
DATABASE_URL=postgresql://...

# LibreDTE
LIBREDTE_API_KEY=WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==
COMPANY_RUT=77154188

# CORS (si aplica)
FRONTEND_URL=https://tu-frontend.onrender.com

# Node
NODE_ENV=production
```

#### Web Service (Frontend)
```env
NEXT_PUBLIC_API_URL=https://bravium-backend.onrender.com
```

### 4. **Verificar Despliegue**

Una vez que Render complete el despliegue:

#### Test Backend
```bash
# Ping
curl https://bravium-backend.onrender.com/ingestion/ping

# Dashboard con filtros
curl "https://bravium-backend.onrender.com/conciliacion/dashboard?year=2025"

# Exportar (debe descargar un archivo)
curl "https://bravium-backend.onrender.com/conciliacion/export/excel?type=all&year=2025" -o test.xlsx
```

#### Test Frontend
```bash
# Abrir en navegador
https://bravium-web.onrender.com
```

---

## 📦 Dependencias Nuevas

### Backend
```json
{
  "exceljs": "^4.4.0"
}
```

**Verificar instalación**:
```bash
# En los logs de Render, buscar:
npm install exceljs
# Debe completar sin errores
```

---

## 🔍 Troubleshooting

### Error: "Module not found: exceljs"

**Solución**:
1. Ir a Render Dashboard → Backend Service
2. Click en "Manual Deploy" → "Clear build cache & deploy"
3. Esperar a que complete el build

### Error: "Cannot find module '@nestjs/common'"

**Solución**:
1. Verificar que `package.json` tenga todas las dependencias
2. Clear build cache en Render
3. Re-deploy

### Error: "Timeout" en exportación

**Solución**:
1. Render Free tier tiene límite de 512MB RAM
2. Considera limitar la exportación a menos registros
3. O actualizar a plan pagado

### Error: "CORS" en frontend

**Solución**:
1. Verificar que `FRONTEND_URL` esté configurado en backend
2. Verificar que `NEXT_PUBLIC_API_URL` esté configurado en frontend
3. Revisar configuración de CORS en `main.ts`

---

## 📊 Monitoreo Post-Despliegue

### 1. **Logs del Backend**
```bash
# En Render Dashboard → Backend Service → Logs
# Buscar:
✅ "Application is running on: https://..."
✅ "Connected to database"
❌ Errores de módulos no encontrados
❌ Errores de conexión a DB
```

### 2. **Métricas de Render**
- CPU Usage: Debe estar < 80%
- Memory Usage: Debe estar < 400MB (en Free tier)
- Response Time: Debe estar < 2s

### 3. **Test de Funcionalidad**

#### Dashboard
```bash
curl "https://bravium-backend.onrender.com/conciliacion/dashboard?year=2025"
```

**Respuesta esperada**:
```json
{
  "period": { "from": "all", "to": "all" },
  "summary": {
    "transactions": { "total": 150, ... },
    "dtes": { "total": 176, ... },
    "matches": { "total": 120, ... }
  },
  ...
}
```

#### Exportación
```bash
curl "https://bravium-backend.onrender.com/conciliacion/export/excel?type=transactions&year=2025" -o test.xlsx
```

**Verificar**:
- ✅ Archivo descargado
- ✅ Tamaño > 0 bytes
- ✅ Se puede abrir en Excel

---

## 🎯 Checklist de Despliegue

### Pre-Deploy
- [x] Código pusheado a GitHub
- [x] Commit message descriptivo
- [x] Dependencias actualizadas en package.json

### Durante Deploy
- [ ] Render detectó el nuevo commit
- [ ] Build del backend iniciado
- [ ] Build del frontend iniciado
- [ ] Instalación de exceljs exitosa
- [ ] No hay errores en logs

### Post-Deploy
- [ ] Backend responde a /ingestion/ping
- [ ] Dashboard con filtros funciona
- [ ] Exportación a Excel funciona
- [ ] Frontend carga correctamente
- [ ] No hay errores en logs de Render
- [ ] Métricas de Render normales

---

## 🔄 Rollback (Si es necesario)

Si algo sale mal:

### Opción 1: Rollback en Render
1. Ir a Render Dashboard → Backend Service
2. Click en "Events"
3. Buscar el deploy anterior exitoso
4. Click en "Rollback to this deploy"

### Opción 2: Rollback en Git
```bash
# Revertir el último commit
git revert HEAD

# Push
git push origin master

# Render auto-desplegará la versión anterior
```

---

## 📞 URLs de los Servicios

Actualiza con tus URLs reales de Render:

- **Backend**: https://bravium-backend.onrender.com
- **Frontend**: https://bravium-web.onrender.com
- **API**: https://bravium-api.onrender.com (si aplica)

---

## 🚨 Notas Importantes

### Render Free Tier
- ⚠️ Los servicios se duermen después de 15 min de inactividad
- ⚠️ Primera request puede tardar 30-60 segundos (cold start)
- ⚠️ Límite de 512MB RAM
- ⚠️ Límite de 750 horas/mes

### Recomendaciones
- ✅ Monitorear uso de memoria con exportaciones grandes
- ✅ Considerar limitar exportaciones a 10,000 registros en Free tier
- ✅ Usar paginación en dashboard para evitar timeouts
- ✅ Configurar alertas en Render para errores

---

## 📈 Próximos Pasos

1. **Verificar Despliegue**
   - Esperar a que Render complete el deploy
   - Verificar logs
   - Probar endpoints

2. **Cargar Datos 2025**
   ```bash
   # Desde tu máquina local, apuntando a producción
   BACKEND_URL=https://bravium-backend.onrender.com node scripts/load_all_2025_dtes.js
   ```

3. **Configurar N8N**
   - Actualizar flujos para procesar cartolas 2025
   - Apuntar a los nuevos endpoints con filtros

4. **Monitorear**
   - Revisar logs diariamente
   - Verificar métricas de Render
   - Probar exportaciones

---

**Última Actualización**: 2026-02-12  
**Commit**: 72b8842  
**Estado**: ✅ Pusheado a GitHub, esperando deploy en Render
