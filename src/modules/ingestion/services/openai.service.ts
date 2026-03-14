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
            Eres un experto contable chileno. Tu tarea es extraer transacciones de los datos proporcionados.
            Los datos pueden ser un objeto JSON crudo de Excel o texto plano extraído de un PDF de una cartola bancaria o estado de cuenta de tarjeta de crédito.
            
            ESQUEMA DE SALIDA (JSON Array):
            [
              {
                "date": "YYYY-MM-DD",
                "description": "Limpieza de descripción (ej: quita números de ruta, quita 'TRANSF A', deja lo relevante)",
                "amount": 1000, // Número positivo para abonos (CREDIT), negativo para cargos (DEBIT)
                "reference": "Número de operación si existe",
                "cuotaNumero": 1,    // Solo si es una cuota: número de cuota (ej. 1 de 12)
                "cuotaTotal": 12,    // Solo si es una cuota: total de cuotas
                "montoOrigen": 1060530  // Solo si es cuota: monto total de la compra en número (opcional)
              }
            ]

            REGLAS:
            1. Analiza los datos de entrada. Identifica cuál es la fecha, cuál el monto y cuál la descripción para cada fila o línea que parezca una transacción.
            2. CONVENCIÓN DE SIGNOS (crítico): En la salida "amount" debe ser: positivo = abono/nota de crédito a favor del cliente (CREDIT), negativo = cargo/cobro/comisión/debito (DEBIT). Si el documento del banco usa la convención inversa (ej. Nota de Crédito con valor negativo, Comisión con valor positivo), INVIERTE el signo al escribir "amount".
            3. Si el monto viene en dos columnas (Abono/Cargo), únelas en "amount" (Abonos positivos, Cargos negativos).
            4. Ignora líneas que sean encabezados, totales de saldo, resumen de cuenta o información irrelevante del banco. Solo devuelve transacciones válidas.
            5. Responde ÚNICAMENTE con el formato JSON array, sin texto adicional markdown.
            6. IMPORTANTE SOBRE FECHAS:
               - Las fechas ya vienen como texto legible (DD/MM/YYYY o YYYY-MM-DD). Cópialas tal cual, solo conviértelas al formato YYYY-MM-DD.
               - Si una fecha viene como número (ej: 46054), es un serial de Excel: conviértelo usando la fórmula (número - 25569) * 86400000 ms desde epoch Unix. Ejemplo: 46054 → 2026-02-02. NO adivines, calcula correctamente.
               - Las fechas son de Chile (UTC-3). Preserva el día exacto que aparece en los datos.
            7. CRÍTICO - ESTADOS DE CUENTA DE TARJETA DE CRÉDITO:
               - Los PDFs de estados de cuenta de TC suelen tener dos secciones: "PERÍODO ANTERIOR" y "PERÍODO ACTUAL".
               - IGNORA completamente la sección de "PERÍODO ANTERIOR" o "PERÍODO DE FACTURACIÓN ANTERIOR". Esas transacciones ya fueron contabilizadas en el estado anterior.
               - Solo extrae las transacciones de la sección "PERÍODO ACTUAL" o "2.PERÍODO ACTUAL".
               - Si una transacción aparece duplicada con fechas distintas (en ambas secciones), usa SOLO la del período actual.
               - Si no puedes distinguir las secciones, extrae todas pero prioriza la última aparición de cada transacción idéntica.
            8. DEDUPLICACIÓN (solo entre secciones, no el mismo día):
               - Si hay dos transacciones con el mismo monto Y descripción pero FECHAS DIFERENTES (ej. en período anterior y período actual), es la misma transacción en dos secciones. Conserva solo la de fecha más reciente.
               - NO dedupliques cuando el mismo monto y descripción aparecen en la MISMA FECHA: pueden ser compras distintas (ej. varias compras Apple mismo día mismo monto). Incluye todas.
               - Incluye también movimientos con "CANCELADO", "ANULADO" o "DEVOLUCIÓN" como transacciones válidas (con su monto) para que queden en la cartola.
            9. CUOTAS: Si la fila corresponde a un cargo en cuotas (ej. columna "N°CUOTA" con valor "01/12", o "CARGO DEL MES" con "VALOR CUOTA MENSUAL"), incluye cuotaNumero (1), cuotaTotal (12) y si está disponible el monto total de la operación en montoOrigen (número sin puntos).

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
