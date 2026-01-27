import { ExportContext, ExportResult } from '../domain/export.types';
import { ExportFormat } from '@prisma/client';

export interface IExportStrategy {
    readonly format: ExportFormat;
    generate(context: ExportContext): Promise<ExportResult>;
}
