# 📊 Dashboard de Conciliación - Guía de Uso

## 🎯 Objetivo

El dashboard de conciliación proporciona una vista completa y en tiempo real del estado de la conciliación entre:
- **Transacciones Bancarias** (cartolas procesadas por N8N)
- **DTEs** (documentos tributarios de LibreDTE)
- **Matches** (conciliaciones automáticas y manuales)

---

## 🔗 Endpoint Principal

```
GET /conciliacion/dashboard?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

### Parámetros (Opcionales)

- `fromDate`: Fecha inicial del período (formato: YYYY-MM-DD)
- `toDate`: Fecha final del período (formato: YYYY-MM-DD)

Si no se especifican fechas, se muestran **todos** los datos.

### Ejemplos de Uso

```bash
# Dashboard completo (todos los datos)
curl http://localhost:3000/conciliacion/dashboard

# Dashboard de Enero 2026
curl "http://localhost:3000/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31"

# Dashboard del último mes
curl "http://localhost:3000/conciliacion/dashboard?fromDate=2026-01-11&toDate=2026-02-11"
```

---

## 📋 Estructura de la Respuesta

### 1. **Resumen General** (`summary`)

#### Transacciones Bancarias
```json
{
  "transactions": {
    "total": 150,
    "matched": 120,
    "pending": 30,
    "match_rate": "80.0%",
    "total_amount": 145000000
  }
}
```

#### DTEs
```json
{
  "dtes": {
    "total": 176,
    "paid": 140,
    "unpaid": 30,
    "partially_paid": 6,
    "payment_rate": "79.5%",
    "total_amount": 141906984,
    "outstanding_amount": 28500000
  }
}
```

#### Matches
```json
{
  "matches": {
    "total": 120,
    "confirmed": 115,
    "draft": 5,
    "automatic": 110,
    "manual": 10,
    "auto_rate": "91.7%"
  }
}
```

### 2. **Pendientes** (`pending`)

#### Transacciones Pendientes
Top 20 transacciones bancarias sin conciliar, ordenadas por monto (mayor a menor):

```json
{
  "transactions": [
    {
      "id": "uuid",
      "date": "2026-01-15",
      "amount": 16720788,
      "description": "TRANSFERENCIA LOGINSA BIOMEDICAL",
      "reference": "REF123456",
      "type": "DEBIT",
      "bankAccount": {
        "accountNumber": "1234567890",
        "bankName": "Banco de Chile"
      }
    }
  ]
}
```

#### DTEs Pendientes
Top 20 DTEs sin pagar, ordenados por monto pendiente (mayor a menor):

```json
{
  "dtes": [
    {
      "id": "uuid",
      "folio": 792,
      "type": 33,
      "totalAmount": 16720788,
      "outstandingAmount": 16720788,
      "issuedDate": "2026-01-30",
      "rutIssuer": "76002528",
      "provider": {
        "name": "LOGINSA BIOMEDICAL LIMITADA",
        "rut": "76002528"
      }
    }
  ]
}
```

### 3. **Matches Recientes** (`recent_matches`)

Últimos 10 matches creados:

```json
{
  "recent_matches": [
    {
      "id": "uuid",
      "status": "CONFIRMED",
      "origin": "AUTOMATIC",
      "confidence": 0.95,
      "ruleApplied": "ExactMatch",
      "createdAt": "2026-02-11T10:30:00Z",
      "transaction": {
        "date": "2026-01-15",
        "amount": 200000,
        "description": "TRANSFERENCIA ARCOVEG"
      },
      "dte": {
        "folio": 792,
        "type": 33,
        "totalAmount": 200000,
        "provider": {
          "name": "ARCOVEG LIMPIEZA"
        }
      }
    }
  ]
}
```

### 4. **Insights** (`insights`)

#### Top Proveedores por Monto Pendiente
Top 10 proveedores con mayor deuda pendiente:

```json
{
  "top_providers": [
    {
      "provider": {
        "id": "uuid",
        "name": "LOGINSA BIOMEDICAL LIMITADA",
        "rut": "76002528"
      },
      "total_outstanding": 16720788,
      "total_amount": 16720788,
      "dte_count": 1
    }
  ]
}
```

#### Valores Altos Sin Match
Transacciones y DTEs de alto valor (>$1M) sin conciliar:

```json
{
  "high_value_unmatched": {
    "transactions": [
      {
        "id": "uuid",
        "date": "2026-01-15",
        "amount": 16720788,
        "description": "TRANSFERENCIA LOGINSA",
        "type": "DEBIT"
      }
    ],
    "dtes": [
      {
        "id": "uuid",
        "folio": 792,
        "type": 33,
        "outstandingAmount": 16720788,
        "issuedDate": "2026-01-30",
        "provider": {
          "name": "LOGINSA BIOMEDICAL LIMITADA"
        }
      }
    ]
  }
}
```

---

## 🎨 Visualización Recomendada

### KPIs Principales (Cards)
1. **Tasa de Conciliación**: `summary.transactions.match_rate`
2. **Monto Pendiente**: `summary.dtes.outstanding_amount`
3. **Matches Automáticos**: `summary.matches.auto_rate`
4. **DTEs sin Pagar**: `summary.dtes.unpaid`

### Gráficos
1. **Pie Chart**: Distribución de transacciones (Matched vs Pending)
2. **Bar Chart**: Top 10 proveedores por monto pendiente
3. **Timeline**: Matches recientes (últimos 10)
4. **Table**: Transacciones y DTEs pendientes de alto valor

### Alertas
- ⚠️ Transacciones >$1M sin match
- ⚠️ DTEs >$1M sin pagar
- ⚠️ Tasa de match <70%
- ⚠️ Monto pendiente >$50M

---

## 🔄 Flujo de Trabajo Recomendado

### 1. **Carga de Datos**
```bash
# Cargar DTEs de Enero
node scripts/load_enero_to_db.js

# Procesar cartolas bancarias (via N8N o manual)
# ...
```

### 2. **Ver Dashboard**
```bash
curl "http://localhost:3000/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31"
```

### 3. **Ejecutar Auto-Match**
```bash
curl -X POST http://localhost:3000/conciliacion/run-auto-match \
  -H "Content-Type: application/json" \
  -d '{"fromDate": "2026-01-01", "toDate": "2026-01-31"}'
```

### 4. **Revisar Dashboard Actualizado**
```bash
curl "http://localhost:3000/conciliacion/dashboard?fromDate=2026-01-01&toDate=2026-01-31"
```

### 5. **Revisar Pendientes de Alto Valor**
- Revisar `insights.high_value_unmatched`
- Hacer matching manual si es necesario

### 6. **Confirmar Matches**
- Revisar `recent_matches` con `status: "DRAFT"`
- Confirmar o rechazar según corresponda

---

## 📊 Métricas de Éxito

### Objetivos
- **Tasa de Match Automático**: >80%
- **Tasa de Conciliación Total**: >95%
- **Tiempo de Conciliación**: <24 horas desde carga
- **Matches Manuales**: <10% del total

### Indicadores de Problemas
- ❌ Tasa de match <70%
- ❌ >20 transacciones de alto valor sin match
- ❌ >$50M en DTEs pendientes
- ❌ >50 DTEs sin pagar después de 30 días

---

## 🛠️ Endpoints Relacionados

### Conciliación
- `GET /conciliacion/dashboard` - Dashboard completo
- `GET /conciliacion/overview` - Vista general (legacy)
- `GET /conciliacion/files` - Archivos procesados
- `POST /conciliacion/run-auto-match` - Ejecutar matching automático

### Ingestion
- `POST /ingestion/libredte/sync` - Sincronizar DTEs desde LibreDTE
- `POST /ingestion/cartolas/drive` - Procesar cartola desde Drive
- `GET /ingestion/ping` - Verificar estado del servicio

---

## 💡 Tips de Uso

### Filtrado por Período
- Usa `fromDate` y `toDate` para analizar períodos específicos
- Útil para reportes mensuales o trimestrales
- Sin filtros = vista completa histórica

### Priorización
- El dashboard ordena pendientes por monto (mayor a menor)
- Enfócate primero en valores altos para mayor impacto
- Revisa `insights.high_value_unmatched` regularmente

### Monitoreo
- Revisa el dashboard diariamente
- Ejecuta auto-match después de cargar nuevos datos
- Confirma matches draft antes de cerrar el período

---

**Última Actualización**: 2026-02-11  
**Versión**: 1.0
