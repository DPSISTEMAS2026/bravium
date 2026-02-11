# Workflows N8N

Este directorio contiene los workflows de automatización de N8N.

## `bank-statement-processor.json`

Workflow de procesamiento automático de cartolas bancarias.

### Funcionalidad
1. **Trigger**: Detecta nuevos archivos PDF en Google Drive (carpeta específica)
2. **Descarga**: Obtiene el archivo PDF desde Google Drive
3. **Análisis**: Usa OpenAI Vision (GPT-4o) para extraer datos de la cartola
4. **Parseo**: Convierte la respuesta de OpenAI a JSON estructurado
5. **Envío**: POST al backend de BRAVIUM con los datos extraídos
6. **Monitoreo**: Verifica errores y notifica a Slack (opcional)

### Estructura de Datos Esperada
```json
{
  "bank": "string",
  "account": "string | null",
  "period": "string | null",
  "currency": "CLP",
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "debit": "number | null",
      "credit": "number | null",
      "balance": "number | null"
    }
  ]
}
```

### Endpoint de Destino
`https://bravium-backend.onrender.com/ingestion/cartolas/drive`

### Configuración Requerida
- Credenciales de Google Drive OAuth2
- Credenciales de OpenAI API
- (Opcional) Webhook de Slack para alertas

### Estado
✅ Activo
