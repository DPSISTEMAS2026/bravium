import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OpenAiService {
    private readonly logger = new Logger(OpenAiService.name);
    private readonly API_URL = 'https://api.openai.com/v1/chat/completions';

    /**
     * Usa OpenAI para normalizar filas de cartolas bancarias que vienen en formatos mixtos o sucios.
     * @param rawRows Filas crudas del Excel/CSV (máximo 50 por lote para eficiencia)
     * @returns Filas normalizadas en un esquema estándar
     */
    async normalizeBankRows(rawRows: any[], filename?: string): Promise<{ controlSums?: { totalAbonos: number, totalCargos: number }, transactions: any[] }> {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            this.logger.warn('OPENAI_API_KEY no encontrada. Usando parseo heurístico básico.');
            return { transactions: rawRows }; // Fallback al parseo manual
        }

        this.logger.log(`Normalizando Batch de ${rawRows.length} filas mediante OpenAI...`);

        try {
            const prompt = `
            Eres un experto contable chileno. Tu tarea es extraer TODAS las transacciones de los datos proporcionados, y ADEMÁS extraer las sumas de control del documento.
            Los datos pueden ser un objeto JSON crudo de Excel o texto plano extraído de un PDF de una cartola bancaria o estado de cuenta de tarjeta de crédito.
            
            ESQUEMA DE SALIDA (JSON Object):
            {
              "controlSums": {
                "totalAbonos": 1500000, 
                "totalCargos": 350000
              },
              "transactions": [
                {
                  "date": "YYYY-MM-DD",
                  "description": "Descripción limpia del movimiento",
                  "amount": 1000,
                  "reference": "Número de operación si existe",
                  "providerRut": "76.794.035-1",
                  "cuotaNumero": 1,
                  "cuotaTotal": 12,
                  "montoOrigen": 1060530
                }
              ]
            }

            REGLAS:
            1. Analiza los datos de entrada. Busca explícitamente los totales de "OTROS ABONOS", "DEPÓSITOS", "OTROS CARGOS", "CHEQUES", etc. en el encabezado o pie del documento. Suma los conceptos de abonos para "totalAbonos" y los de cargos (en valor absoluto positivo) para "totalCargos". Si no encuentras estos totales explícitos en el documento, deja "controlSums" con los valores que tú calcules sumando las transacciones.
            2. CONVENCIÓN DE SIGNOS: positivo = abono/depósito (CREDIT), negativo = cargo/cobro/comisión (DEBIT). Si el banco usa convención inversa, invierte el signo.
            3. Si el monto viene en dos columnas (Abono/Cargo), únelas en "amount" (Abonos positivos, Cargos negativos).
            4. Ignora líneas que sean encabezados de tabla o totales de saldo EN LA LISTA DE TRANSACCIONES, pero USA los totales para llenar "controlSums".
            5. Responde ÚNICAMENTE con el formato JSON object solicitado, sin texto adicional.
            6. IMPORTANTE SOBRE FECHAS: Convierte a formato YYYY-MM-DD. Si no hay fecha en una fila, HEREDA la fecha anterior.
            7. ESTADOS DE CUENTA DE TC: Si hay "PERÍODO ANTERIOR" y "PERÍODO ACTUAL", ignora el anterior.
            8. DEDUPLICACIÓN: NO dedupliques misma fecha, mismo monto.
            9. CUOTAS: Extrae datos de cuotas si aplica.
            10. REGLA DE ORO: NO TE SALTES NINGÚN MOVIMIENTO. Extrae el 100% de los datos a "transactions".
            11. RUT DEL PROVEEDOR: Extrae el RUT chileno de la descripción a "providerRut" si existe.
            12. AÑO DE FECHAS: Si la fecha en la fila no contiene el año, DEDÚCELO del nombre de archivo. Ejemplo, si el nombre de archivo dice 2026, asume el año 2026 para todas las fechas en formato YYYY-MM-DD.

            DATOS ENTRANTE (Nombre Archivo: ${filename || 'Desconocido'}):
            ${JSON.stringify(rawRows).substring(0, 50000)}
            `;

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o', // Usar gpt-4o para mayor precisión en sumas
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API Error: ${response.statusText}`);
            }

            const result = await response.json();
            const content = JSON.parse(result.choices[0].message.content);

            // Validar que la respuesta sea el objeto esperado
            if (content.transactions && Array.isArray(content.transactions)) {
                return content;
            }
            if (content.data && Array.isArray(content.data)) {
                return { controlSums: content.controlSums, transactions: content.data };
            }
            if (Array.isArray(content)) {
                return { transactions: content };
            }

            return { transactions: [content] };

        } catch (error) {
            this.logger.error('Error normalizando con AI, usando fallback heurístico:', error);
            return { transactions: rawRows };
        }
    }
}
