# 📊 Datos de Enero 2026 - Listos para Matching

## ✅ Estado Actual

**Datos Extraídos**: ✅ Completado
**Análisis**: ✅ Completado  
**Carga a BD**: ⏳ Pendiente

---

## 📈 Resumen de Datos Disponibles

### DTEs de Enero 2026

- **Total DTEs**: 176 documentos
- **Monto Total**: $141.906.984 CLP
- **Proveedores Únicos**: 70
- **Período**: 2026-01-01 → 2026-01-31

### Distribución por Tipo de Documento

| Tipo | Cantidad | Monto Total |
|------|----------|-------------|
| Factura Electrónica (33) | 162 | $132.425.292 |
| Factura Exenta (34) | 7 | $3.621.977 |
| Nota de Crédito (61) | 7 | $5.859.715 |

### Distribución por Rango de Montos

| Rango | Cantidad | Porcentaje |
|-------|----------|------------|
| Menos de $100k | 46 | 26.1% |
| $100k - $500k | 68 | 38.6% |
| $500k - $1M | 30 | 17.0% |
| $1M - $5M | 30 | 17.0% |
| Más de $5M | 2 | 1.1% |

---

## 👥 Top 10 Proveedores (por monto)

1. **LOGINSA BIOMEDICAL LIMITADA** (76002528)
   - DTEs: 1
   - Total: $16.720.788

2. **EASY WAYS CHILE SPA** (76287445)
   - DTEs: 6
   - Total: $16.541.158

3. **INVERSIONES Y ASESORIAS FEMA LIMITADA** (76010745)
   - DTEs: 3
   - Total: $14.242.675

4. **INNOVACION Y TECNOLOGIA EMPRESARIAL ITEM LIMITADA** (78936330)
   - DTEs: 11
   - Total: $13.482.346

5. **PATAGONIK S A** (99535370)
   - DTEs: 5
   - Total: $8.721.537

6. **GASEI S.A.** (76321780)
   - DTEs: 2
   - Total: $5.386.776

7. **OSOJI ROBOTICS CORPORATION CHILE SPA** (76794035)
   - DTEs: 2
   - Total: $5.381.144

8. **FALABELLA RETAIL S.A.** (77261280)
   - DTEs: 9
   - Total: $4.817.679

9. **SAMSUNG ELECTRONICS CHILE LIMITADA** (77879240)
   - DTEs: 4
   - Total: $4.149.901

10. **VETO Y CIA LTDA** (82525800)
    - DTEs: 5
    - Total: $3.483.164

---

## 🔑 Campos Disponibles para Matching

Cada DTE contiene los siguientes campos útiles para matching:

```json
{
  "emisor": 76391401,              // RUT del proveedor (número)
  "razon_social": "NOMBRE...",     // Nombre del proveedor
  "dte": 33,                       // Tipo de documento
  "tipo": "Factura electrónica",   // Descripción del tipo
  "folio": 792,                    // Número único del documento
  "fecha": "2026-01-30",           // Fecha de emisión
  "total": 200000,                 // Monto total
  "usuario": "email@...",          // Usuario que registró
  "intercambio": null,             // Info de intercambio SII
  "mipyme": null                   // Info MiPyme
}
```

---

## 🎯 Estrategias de Matching Recomendadas

### 1. **Match Exacto** (Alta Confianza)
- Monto exacto + Fecha ±3 días
- Monto exacto + RUT proveedor

### 2. **Match Aproximado** (Confianza Media)
- Monto similar (±2%) + Fecha ±5 días
- Monto similar + RUT proveedor + Fecha ±7 días

### 3. **Match Manual** (Requiere Revisión)
- Pagos parciales
- Múltiples DTEs en una transacción
- Diferencias de monto por comisiones/descuentos

---

## ⚠️ Consideraciones Importantes

### Notas de Crédito
- **7 Notas de Crédito** por $5.859.715
- Estas **restan** del total a pagar
- Deben considerarse en el matching

### Diferencias de Fechas
- La **fecha del DTE** es la fecha de emisión
- La **fecha de pago** puede ser días o semanas después
- Rango recomendado: ±7 días para matching inicial

### Pagos Parciales
- Algunos DTEs pueden pagarse en cuotas
- Un DTE puede tener múltiples transacciones bancarias
- Necesario trackear `outstandingAmount` (saldo pendiente)

### Múltiples DTEs por Transacción
- Una transferencia puede pagar varios DTEs
- Especialmente común con proveedores recurrentes

---

## 📂 Archivos Generados

### Datos Crudos
- `data/dtes_enero_2026.json` - Todos los DTEs extraídos (176 docs)
- `data/analisis_enero_2026.json` - Resumen estadístico

### Scripts Disponibles
- `scripts/extract_enero_dtes.js` - Extraer DTEs desde LibreDTE ✅
- `scripts/analyze_enero_dtes.js` - Analizar datos extraídos ✅
- `scripts/load_enero_to_db.js` - Cargar a base de datos ⏳

---

## 🚀 Próximos Pasos

### 1. Cargar DTEs a la Base de Datos
```bash
# Asegúrate de que el backend esté corriendo
npm run start:dev

# Carga los DTEs
node scripts/load_enero_to_db.js
```

### 2. Cargar Transacciones Bancarias de Enero
- Procesar cartolas bancarias de enero
- Usar el workflow de N8N o carga manual

### 3. Ejecutar Auto-Match
```bash
# Via API
curl -X POST http://localhost:3000/conciliacion/run-auto-match
```

### 4. Revisar Matches
- Revisar matches automáticos
- Resolver casos ambiguos manualmente
- Validar totales

---

## 📊 Métricas Esperadas

Con 176 DTEs y asumiendo una tasa de pago normal:

- **Matches Automáticos Esperados**: ~120-140 (70-80%)
- **Matches Manuales Necesarios**: ~30-50 (20-30%)
- **DTEs sin Match** (pendientes de pago): ~5-10 (3-5%)

---

## 💡 Tips para Mejorar el Matching

1. **Normalizar RUTs**: Asegurar formato consistente (con/sin DV)
2. **Normalizar Nombres**: Limpiar caracteres especiales en razones sociales
3. **Considerar Comisiones**: Algunos bancos cobran comisión en transferencias
4. **Redondeos**: Algunos sistemas redondean montos
5. **Múltiples Cuentas**: Un proveedor puede tener varias cuentas bancarias

---

**Última Actualización**: 2026-02-11  
**Estado**: Datos listos para carga y matching
