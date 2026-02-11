# Scripts de Utilidad

Este directorio contiene scripts de utilidad para desarrollo, debugging y operaciones manuales.

## 🔗 Scripts de Integración LibreDTE

### `extract_enero_dtes.js` ⭐
Extrae TODOS los DTEs de Enero 2026 desde LibreDTE y los guarda en JSON.
- **Uso**: `node scripts/extract_enero_dtes.js`
- **Salida**: `data/dtes_enero_2026.json`
- **Datos**: DTEs recibidos + Registro de compras
- **Análisis**: Estadísticas automáticas (montos, proveedores, tipos)

### `analyze_enero_dtes.js`
Analiza en detalle los DTEs extraídos de enero.
- **Uso**: `node scripts/analyze_enero_dtes.js`
- **Requiere**: `data/dtes_enero_2026.json` (ejecutar `extract_enero_dtes.js` primero)
- **Salida**: `data/analisis_enero_2026.json`
- **Muestra**: Distribución de montos, top proveedores, tipos de documentos

### `load_enero_to_db.js`
Carga los DTEs de enero a la base de datos via backend.
- **Uso**: `node scripts/load_enero_to_db.js`
- **Requiere**: Backend corriendo (`npm run start:dev`)
- **Endpoint**: `POST /ingestion/libredte/sync`

### `fetch_libredte_data.js`
Script de prueba para verificar conexión con LibreDTE API.
- **Uso**: `node scripts/fetch_libredte_data.js`
- **Propósito**: Testing y validación de credenciales
- **Muestra**: Últimos 10 DTEs de cada tipo

### `sync_libredte_dtes.js`
Sincroniza DTEs desde LibreDTE via backend API.
- **Uso**: `node scripts/sync_libredte_dtes.js [fecha_desde] [fecha_hasta]`
- **Ejemplo**: `node scripts/sync_libredte_dtes.js 2026-01-01 2026-01-31`
- **Default**: Últimos 30 días si no se especifican fechas

## 📊 Scripts de Producción

### `upload_dtes_prod.js`
Sube el archivo CSV de DTEs recibidos al backend de producción.
- **Uso**: `node upload_dtes_prod.js`
- **Requiere**: Archivo `dte_recibidos_77154188.csv` en la carpeta `data/`
- **Endpoint**: `https://bravium-backend.onrender.com/ingestion/manual/dtes-csv`

### `trigger_match.js`
Dispara manualmente el proceso de auto-matching de conciliación en producción.
- **Uso**: `node trigger_match.js`
- **Endpoint**: `https://bravium-backend.onrender.com/conciliacion/run-auto-match`

## 🔍 Scripts de Debugging

### `check_tx.ts`
Verifica el estado de las transacciones bancarias en la base de datos.
- **Uso**: `npx ts-node scripts/check_tx.ts`
- **Muestra**: Conteo total y muestra de 5 transacciones

### `check_matches.ts`
Verifica los matches de conciliación existentes.
- **Uso**: `npx ts-node scripts/check_matches.ts`
- **Muestra**: Todos los matches con detalles de transacción, DTE y pago asociado

### `debug_matches.ts`
Analiza transacciones pendientes y busca candidatos potenciales para matching.
- **Uso**: `npx ts-node scripts/debug_matches.ts`
- **Criterios**: Diferencia de monto < 2000 CLP y diferencia de fecha < 10 días
- **Muestra**: 20 transacciones pendientes más recientes vs 50 DTEs más recientes

## 📋 Workflow Recomendado para Enero 2026

1. **Extraer datos de LibreDTE**:
   ```bash
   node scripts/extract_enero_dtes.js
   ```

2. **Analizar datos extraídos**:
   ```bash
   node scripts/analyze_enero_dtes.js
   ```

3. **Cargar a base de datos** (con backend corriendo):
   ```bash
   npm run start:dev  # En otra terminal
   node scripts/load_enero_to_db.js
   ```

4. **Ejecutar auto-matching**:
   ```bash
   node scripts/trigger_match.js
   ```

5. **Revisar resultados**:
   ```bash
   npx ts-node scripts/check_matches.ts
   ```

## 📝 Notas
- Los scripts `.ts` requieren TypeScript y acceso a Prisma
- Los scripts `.js` son standalone y solo requieren Node.js
- Scripts de producción apuntan a `bravium-backend.onrender.com`
- Scripts de LibreDTE requieren `LIBREDTE_API_KEY` en `.env`

