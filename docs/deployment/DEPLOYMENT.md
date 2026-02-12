# 🚀 Deployment a Render - Guía Rápida

## ⚠️ IMPORTANTE: Configurar Git Primero

Antes de hacer deployment, necesitas configurar tu identidad en Git:

```bash
# Configuración global (recomendado)
git config --global user.name "Diego Diaz"
git config --global user.email "d.diazaraya19@gmail.com"

# O solo para este repositorio
git config user.name "Diego Diaz"
git config user.email "d.diazaraya19@gmail.com"
```

---

## 🔧 Opción 1: Deployment Automático (Recomendado)

Usa el script de deployment que verifica todo automáticamente:

```powershell
.\deploy.ps1
```

El script:
1. ✅ Verifica que Git esté configurado
2. 📊 Muestra los cambios a commitear
3. 📝 Muestra el mensaje del commit
4. ❓ Pide confirmación
5. 📦 Hace commit
6. 🚀 Hace push a origin/master
7. 🎉 Render despliega automáticamente

---

## 🔧 Opción 2: Deployment Manual

Si prefieres hacerlo manualmente:

### 1. Configurar Git (si no lo has hecho)
```bash
git config user.name "Diego Diaz"
git config user.email "d.diazaraya19@gmail.com"
```

### 2. Verificar cambios
```bash
git status
```

### 3. Hacer commit
```bash
git commit -m "feat: Sistema completo de conciliación con LibreDTE

- Integración LibreDTE API con formato correcto
- Dashboard de conciliación con estadísticas
- Scripts de extracción y análisis de DTEs
- Documentación completa del sistema

Endpoints nuevos:
- GET /conciliacion/dashboard
- POST /ingestion/libredte/sync"
```

### 4. Push a GitHub
```bash
git push origin master
```

### 5. Verificar Deployment en Render
- Ve a https://dashboard.render.com
- Busca tu servicio "bravium-backend"
- Verás el deployment en progreso
- Espera ~5-10 minutos

---

## 📊 Cambios que se Desplegarán

### Backend (NestJS)
- ✅ `ConciliacionDashboardService` - Nuevo servicio de dashboard
- ✅ `ConciliacionController` - Endpoint `/conciliacion/dashboard`
- ✅ `LibreDteService` - Integración corregida con LibreDTE
- ✅ `ConciliacionModule` - Módulo actualizado

### Scripts
- ✅ Scripts de extracción de DTEs
- ✅ Scripts de análisis
- ✅ Scripts de carga a BD

### Documentación
- ✅ SISTEMA_CONCILIACION.md
- ✅ DASHBOARD_CONCILIACION.md
- ✅ ENERO_2026_DATOS.md
- ✅ LIBREDTE_INTEGRATION.md

---

## 🔍 Verificar Deployment

### 1. Esperar a que termine el deployment
```bash
# Ver logs en Render Dashboard
# O usar Render CLI si lo tienes instalado
```

### 2. Probar el nuevo endpoint
```bash
# Dashboard completo
curl https://bravium-backend.onrender.com/conciliacion/dashboard

# Dashboard de Enero 2026
curl "https://bravium-backend.onrender.com/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31"
```

### 3. Sincronizar DTEs de Enero
```bash
curl -X POST https://bravium-backend.onrender.com/ingestion/libredte/sync \
  -H "Content-Type: application/json" \
  -d '{"fromDate": "2026-01-01", "toDate": "2026-01-31"}'
```

---

## ⚙️ Variables de Entorno en Render

Asegúrate de que Render tenga configuradas estas variables:

```
LIBREDTE_API_KEY=WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==
COMPANY_RUT=77154188
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

Para agregar/verificar:
1. Ve a Render Dashboard
2. Selecciona tu servicio "bravium-backend"
3. Ve a "Environment"
4. Agrega las variables que falten

---

## 🎯 Próximos Pasos Después del Deployment

### 1. Cargar DTEs de Enero
```bash
# Desde tu máquina local (apuntando a producción)
BACKEND_URL=bravium-backend.onrender.com node scripts/load_enero_to_db.js
```

O edita el script para usar la URL de producción por defecto.

### 2. Ver Dashboard
```bash
curl https://bravium-backend.onrender.com/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31
```

### 3. Ejecutar Auto-Match
```bash
curl -X POST https://bravium-backend.onrender.com/conciliacion/run-auto-match \
  -H "Content-Type: application/json" \
  -d '{"fromDate": "2026-01-01", "toDate": "2026-01-31"}'
```

---

## 🆘 Troubleshooting

### Error: "Author identity unknown"
```bash
# Configura Git
git config user.name "Tu Nombre"
git config user.email "tu@email.com"
```

### Error: "failed to push some refs"
```bash
# Pull primero
git pull origin master --rebase
git push origin master
```

### Deployment falla en Render
1. Revisa los logs en Render Dashboard
2. Verifica que todas las dependencias estén en `package.json`
3. Verifica que `npm run build` funcione localmente

### Endpoint no funciona después del deployment
1. Espera 5-10 minutos (deployment puede tardar)
2. Verifica logs en Render
3. Prueba con `curl -v` para ver detalles del error

---

**Última Actualización**: 2026-02-11  
**Versión**: 1.0
