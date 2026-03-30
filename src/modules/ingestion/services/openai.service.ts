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
    async normalizeBankRows(rawRows: any[]): Promise<any[]> {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            this.logger.warn('OPENAI_API_KEY no encontrada. Usando parseo heurístico básico.');
            return rawRows; // Fallback al parseo manual
        }

        this.logger.log(`Normalizando Batch de ${rawRows.length} filas mediante OpenAI...`);

        try {
            const prompt = `
            Eres un experto contable chileno. Tu tarea es extraer TODAS las transacciones de los datos proporcionados.
            Los datos pueden ser un objeto JSON crudo de Excel o texto plano extraído de un PDF de una cartola bancaria o estado de cuenta de tarjeta de crédito.
            
            ESQUEMA DE SALIDA (JSON Array):
            [
              {
                "date": "YYYY-MM-DD",
                "description": "Descripción limpia del movimiento",
                "amount": 1000,
                "reference": "Número de operación si existe",
                "cuotaNumero": 1,
                "cuotaTotal": 12,
                "montoOrigen": 1060530
              }
            ]

            REGLAS:
            1. Analiza los datos de entrada. Identifica cuál es la fecha, cuál el monto y cuál la descripción para cada fila.
            2. CONVENCIÓN DE SIGNOS: positivo = abono/depósito (CREDIT), negativo = cargo/cobro/comisión (DEBIT). Si el banco usa convención inversa, invierte el signo.
            3. Si el monto viene en dos columnas (Abono/Cargo), únelas en "amount" (Abonos positivos, Cargos negativos).
            4. Ignora solo líneas que sean encabezados de tabla o totales de saldo. TODO lo demás que tenga fecha y monto DEBE incluirse.
            5. Responde ÚNICAMENTE con el formato JSON array, sin texto adicional.
            6. IMPORTANTE SOBRE FECHAS:
               - Convierte a formato YYYY-MM-DD.
               - Si una fecha viene como número serial de Excel (ej: 46054), conviértelo usando (número - 25569) * 86400000 ms desde epoch Unix.
               - Las fechas son de Chile (UTC-3). Preserva el día exacto que aparece en los datos.
               - REGLA CONTINUACIÓN: Si una fila de transacción no tiene fecha, HEREDA la fecha de la fila inmediatamente anterior. No descartes filas por no tener fecha repetida.
            7. ESTADOS DE CUENTA DE TARJETA DE CRÉDITO:
               - Si hay dos secciones "PERÍODO ANTERIOR" y "PERÍODO ACTUAL", IGNORA solo el "PERÍODO ANTERIOR".
               - Solo extrae las transacciones de la sección "PERÍODO ACTUAL".
            8. DEDUPLICACIÓN MÍNIMA:
               - Si hay dos transacciones con mismo monto Y descripción pero FECHAS DIFERENTES entre secciones distintas, conserva solo la más reciente.
               - NO dedupliques cuando el mismo monto y descripción aparecen en la MISMA FECHA: pueden ser compras distintas. Incluye todas.
               - Incluye movimientos con "CANCELADO", "ANULADO" o "DEVOLUCIÓN" como transacciones válidas.
            9. CUOTAS: Si la fila es un cargo en cuotas, incluye cuotaNumero, cuotaTotal y montoOrigen.
            10. REGLA DE ORO: NO TE SALTES NINGÚN MOVIMIENTO. Si el archivo tiene 10 movimientos, tu respuesta DEBE tener 10 objetos. Extrae el 100% de los datos.

            DATOS ENTRANTE (JSON o Texto PDF):
            ${JSON.stringify(rawRows).substring(0, 50000)}
            `;

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', // Económico y rápido para este caso
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

            // Validar que la respuesta sea un array o tenga un array adentro
            if (Array.isArray(content)) return content;
            if (content.transactions && Array.isArray(content.transactions)) return content.transactions;
            if (content.data && Array.isArray(content.data)) return content.data;

            // Si es un objeto único que no es array, lo envolvemos en uno
            return [content];

        } catch (error) {
            this.logger.error('Error normalizando con AI, usando fallback heurístico:', error);
            return rawRows;
        }
    }
}
