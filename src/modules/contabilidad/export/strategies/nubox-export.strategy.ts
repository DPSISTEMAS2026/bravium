import { IExportStrategy } from './export-strategy.interface';
import { ExportContext, ExportResult } from '../domain/export.types';
import { ExportFormat, LedgerEntryType } from '@prisma/client';

export class NuboxExportStrategy implements IExportStrategy {
    readonly format = ExportFormat.NUBOX_PRO;

    /**
     * Generates a CSV compatible with Nubox Import.
     * Format (Simplified example):
     * Date;AccountCode;Debit;Credit;Description
     */
    async generate(context: ExportContext): Promise<ExportResult> {
        const { entries } = context;
        const header = 'Fecha;Cuenta;Debe;Haber;Glosa;RutTercero';
        const lines = [header];

        for (const entry of entries) {
            // Map Entry Type to Nubox Logic
            // This is a naive implementation. In production this uses a configured Account Plan.
            const dateStr = entry.transactionDate.toISOString().split('T')[0];
            const desc = entry.description || 'Sin glosa';

            let debit = 0;
            let credit = 0;
            let account = '0000'; // Default unknown

            // Mapping Logic
            if (entry.type === LedgerEntryType.INVOICE_RECEIVED) {
                account = '2105'; // Proveedores Nacionales
                credit = entry.amount; // Aumenta pasivo (Haber)
            } else if (entry.type === LedgerEntryType.PAYMENT_ISSUED) {
                account = '2105'; // Proveedores Nacionales
                debit = Math.abs(entry.amount); // Disminuye pasivo (Debe)
            } else if (entry.type === LedgerEntryType.EXPENSE_BY_DIFFERENCE) {
                account = '5201'; // Gastos menores
                debit = Math.abs(entry.amount); // Gasto (Debe)
            }

            // Nubox usually expects two lines per seat (Double Entry), or one line if importing specifically to a module (Bank/Purchase).
            // Assuming this is "Comprobante Contable" import.

            lines.push(`${dateStr};${account};${debit};${credit};${desc};${entry.providerId || ''}`);
        }

        return {
            fileContent: lines.join('\n'),
            fileName: `nubox_export_${context.period.year}_${context.period.month}.csv`,
            rowCount: lines.length - 1,
        };
    }
}
