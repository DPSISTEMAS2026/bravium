import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { ExportType } from '../dto/export-filters.dto';
import { DashboardFiltersDto } from '../dto/dashboard-filters.dto';

@Injectable()
export class ExportService {
    private readonly logger = new Logger(ExportService.name);

    constructor(private prisma: PrismaService) { }

    async exportToExcel(
        type: ExportType,
        filters: DashboardFiltersDto,
    ): Promise<ExcelJS.Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Bravium - Sistema de Conciliación';
        workbook.created = new Date();

        switch (type) {
            case ExportType.TRANSACTIONS:
                await this.addTransactionsSheet(workbook, filters);
                break;
            case ExportType.DTES:
                await this.addDtesSheet(workbook, filters);
                break;
            case ExportType.MATCHES:
                await this.addMatchesSheet(workbook, filters);
                break;
            case ExportType.ALL:
                await this.addTransactionsSheet(workbook, filters);
                await this.addDtesSheet(workbook, filters);
                await this.addMatchesSheet(workbook, filters);
                break;
        }

        return await workbook.xlsx.writeBuffer();
    }

    private async addTransactionsSheet(
        workbook: ExcelJS.Workbook,
        filters: DashboardFiltersDto,
    ) {
        const sheet = workbook.addWorksheet('Transacciones Bancarias');

        // Configurar columnas
        sheet.columns = [
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Descripción', key: 'description', width: 40 },
            { header: 'Referencia', key: 'reference', width: 20 },
            { header: 'Banco', key: 'bank', width: 20 },
            { header: 'Cuenta', key: 'account', width: 15 },
            { header: 'Monto', key: 'amount', width: 15 },
            { header: 'Tipo', key: 'type', width: 10 },
            { header: 'Estado', key: 'status', width: 12 },
        ];

        // Estilo del header
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' },
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Obtener datos
        const where = this.buildTransactionWhere(filters);
        const transactions = await this.prisma.bankTransaction.findMany({
            where,
            include: {
                bankAccount: true,
            },
            orderBy: { date: 'desc' },
            take: 50000, // Límite de seguridad
        });

        // Agregar datos
        transactions.forEach((tx) => {
            const row = sheet.addRow({
                date: tx.date.toISOString().split('T')[0],
                description: tx.description,
                reference: tx.reference || '',
                bank: tx.bankAccount?.bankName || 'N/A',
                account: tx.bankAccount?.accountNumber || 'N/A',
                amount: Math.abs(tx.amount),
                type: tx.type === 'DEBIT' ? 'Cargo' : 'Abono',
                status: this.translateStatus(tx.status),
            });

            // Formato condicional
            if (tx.type === 'DEBIT') {
                row.getCell('amount').font = { color: { argb: 'FFDC3545' } };
            } else {
                row.getCell('amount').font = { color: { argb: 'FF28A745' } };
            }

            row.getCell('amount').numFmt = '$#,##0';
        });

        // Auto-filtro
        sheet.autoFilter = {
            from: 'A1',
            to: `H${sheet.rowCount}`,
        };

        this.logger.log(`Exported ${transactions.length} transactions to Excel`);
    }

    private async addDtesSheet(
        workbook: ExcelJS.Workbook,
        filters: DashboardFiltersDto,
    ) {
        const sheet = workbook.addWorksheet('DTEs (Facturas)');

        // Configurar columnas
        sheet.columns = [
            { header: 'Folio', key: 'folio', width: 12 },
            { header: 'Tipo', key: 'type', width: 10 },
            { header: 'Fecha Emisión', key: 'issuedDate', width: 14 },
            { header: 'Proveedor', key: 'provider', width: 35 },
            { header: 'RUT Proveedor', key: 'rut', width: 15 },
            { header: 'Monto Total', key: 'totalAmount', width: 15 },
            { header: 'Monto Pendiente', key: 'outstandingAmount', width: 18 },
            { header: 'Estado Pago', key: 'paymentStatus', width: 15 },
        ];

        // Estilo del header
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF9333EA' },
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Obtener datos
        const where = this.buildDteWhere(filters);
        const dtes = await this.prisma.dTE.findMany({
            where,
            include: {
                provider: true,
            },
            orderBy: { issuedDate: 'desc' },
            take: 50000,
        });

        // Agregar datos
        dtes.forEach((dte) => {
            const row = sheet.addRow({
                folio: dte.folio,
                type: this.getDteTypeName(dte.type),
                issuedDate: dte.issuedDate.toISOString().split('T')[0],
                provider: dte.provider?.name || 'Sin proveedor',
                rut: dte.provider?.rut || dte.rutIssuer,
                totalAmount: dte.totalAmount,
                outstandingAmount: dte.outstandingAmount,
                paymentStatus: this.translatePaymentStatus(dte.paymentStatus),
            });

            // Formato condicional
            if (dte.outstandingAmount > 0) {
                row.getCell('outstandingAmount').font = { color: { argb: 'FFDC3545' } };
            }

            row.getCell('totalAmount').numFmt = '$#,##0';
            row.getCell('outstandingAmount').numFmt = '$#,##0';
        });

        // Auto-filtro
        sheet.autoFilter = {
            from: 'A1',
            to: `H${sheet.rowCount}`,
        };

        this.logger.log(`Exported ${dtes.length} DTEs to Excel`);
    }

    private async addMatchesSheet(
        workbook: ExcelJS.Workbook,
        filters: DashboardFiltersDto,
    ) {
        const sheet = workbook.addWorksheet('Matches (Conciliaciones)');

        // Configurar columnas
        sheet.columns = [
            { header: 'Fecha Match', key: 'createdAt', width: 14 },
            { header: 'Estado', key: 'status', width: 12 },
            { header: 'Origen', key: 'origin', width: 12 },
            { header: 'Confianza', key: 'confidence', width: 12 },
            { header: 'Fecha Transacción', key: 'txDate', width: 16 },
            { header: 'Descripción TX', key: 'txDescription', width: 35 },
            { header: 'Monto TX', key: 'txAmount', width: 15 },
            { header: 'Folio DTE', key: 'dteFolio', width: 12 },
            { header: 'Proveedor', key: 'dteProvider', width: 30 },
            { header: 'Monto DTE', key: 'dteAmount', width: 15 },
            { header: 'Diferencia', key: 'difference', width: 15 },
        ];

        // Estilo del header
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF10B981' },
        };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Obtener datos
        const where = this.buildMatchWhere(filters);
        const matches = await this.prisma.reconciliationMatch.findMany({
            where,
            include: {
                transaction: true,
                dte: {
                    include: {
                        provider: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 50000,
        });

        // Agregar datos
        matches.forEach((match) => {
            const txAmount = Math.abs(match.transaction.amount);
            const dteAmount = match.dte?.totalAmount || 0;
            const difference = Math.abs(txAmount - dteAmount);

            const row = sheet.addRow({
                createdAt: match.createdAt.toISOString().split('T')[0],
                status: this.translateMatchStatus(match.status),
                origin: match.origin === 'AUTOMATIC' ? 'Automático' : 'Manual',
                confidence: `${(match.confidence * 100).toFixed(0)}%`,
                txDate: match.transaction.date.toISOString().split('T')[0],
                txDescription: match.transaction.description,
                txAmount: txAmount,
                dteFolio: match.dte?.folio || 'N/A',
                dteProvider: match.dte?.provider?.name || 'N/A',
                dteAmount: dteAmount,
                difference: difference,
            });

            // Formato condicional
            if (match.confidence >= 0.9) {
                row.getCell('confidence').font = { color: { argb: 'FF28A745' } };
            } else if (match.confidence >= 0.7) {
                row.getCell('confidence').font = { color: { argb: 'FFFFC107' } };
            } else {
                row.getCell('confidence').font = { color: { argb: 'FFDC3545' } };
            }

            row.getCell('txAmount').numFmt = '$#,##0';
            row.getCell('dteAmount').numFmt = '$#,##0';
            row.getCell('difference').numFmt = '$#,##0';
        });

        // Auto-filtro
        sheet.autoFilter = {
            from: 'A1',
            to: `K${sheet.rowCount}`,
        };

        this.logger.log(`Exported ${matches.length} matches to Excel`);
    }

    // Helper methods para construir WHERE clauses
    private buildTransactionWhere(filters: DashboardFiltersDto): any {
        const where: any = {};

        // Filtro por fecha
        if (filters.fromDate || filters.toDate || filters.year || filters.months) {
            where.date = {};

            if (filters.fromDate) {
                where.date.gte = new Date(filters.fromDate);
            }
            if (filters.toDate) {
                where.date.lte = new Date(filters.toDate);
            }

            // Si se especifica año y/o meses
            if (filters.year) {
                const yearStart = new Date(`${filters.year}-01-01`);
                const yearEnd = new Date(`${filters.year}-12-31`);
                where.date.gte = where.date.gte || yearStart;
                where.date.lte = where.date.lte || yearEnd;
            }
        }

        // Filtro por estado
        if (filters.status && filters.status !== 'ALL') {
            where.status = filters.status;
        }

        // Filtro por monto
        if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
            where.amount = {};
            if (filters.minAmount !== undefined) {
                where.amount.gte = -filters.maxAmount || filters.minAmount; // Para débitos negativos
            }
            if (filters.maxAmount !== undefined) {
                where.amount.lte = filters.maxAmount;
            }
        }

        return where;
    }

    private buildDteWhere(filters: DashboardFiltersDto): any {
        const where: any = {};

        // Filtro por fecha
        if (filters.fromDate || filters.toDate || filters.year || filters.months) {
            where.issuedDate = {};

            if (filters.fromDate) {
                where.issuedDate.gte = new Date(filters.fromDate);
            }
            if (filters.toDate) {
                where.issuedDate.lte = new Date(filters.toDate);
            }

            if (filters.year) {
                const yearStart = new Date(`${filters.year}-01-01`);
                const yearEnd = new Date(`${filters.year}-12-31`);
                where.issuedDate.gte = where.issuedDate.gte || yearStart;
                where.issuedDate.lte = where.issuedDate.lte || yearEnd;
            }
        }

        // Filtro por proveedor
        if (filters.providerIds && filters.providerIds.length > 0) {
            where.providerId = { in: filters.providerIds };
        }

        // Filtro por estado de pago
        if (filters.status && filters.status !== 'ALL') {
            if (filters.status === 'PENDING') {
                where.paymentStatus = 'UNPAID';
            } else if (filters.status === 'MATCHED') {
                where.paymentStatus = { in: ['PAID', 'PARTIALLY_PAID'] };
            }
        }

        // Filtro por monto
        if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
            where.totalAmount = {};
            if (filters.minAmount !== undefined) {
                where.totalAmount.gte = filters.minAmount;
            }
            if (filters.maxAmount !== undefined) {
                where.totalAmount.lte = filters.maxAmount;
            }
        }

        return where;
    }

    private buildMatchWhere(filters: DashboardFiltersDto): any {
        const where: any = {};

        // Filtro por fecha de creación del match
        if (filters.fromDate || filters.toDate || filters.year) {
            where.createdAt = {};

            if (filters.fromDate) {
                where.createdAt.gte = new Date(filters.fromDate);
            }
            if (filters.toDate) {
                where.createdAt.lte = new Date(filters.toDate);
            }

            if (filters.year) {
                const yearStart = new Date(`${filters.year}-01-01`);
                const yearEnd = new Date(`${filters.year}-12-31`);
                where.createdAt.gte = where.createdAt.gte || yearStart;
                where.createdAt.lte = where.createdAt.lte || yearEnd;
            }
        }

        // Filtro por estado
        if (filters.status && filters.status !== 'ALL') {
            where.status = filters.status === 'MATCHED' ? 'CONFIRMED' : filters.status;
        }

        return where;
    }

    // Helper methods para traducción
    private translateStatus(status: string): string {
        const map = {
            PENDING: 'Pendiente',
            MATCHED: 'Conciliado',
            CONFIRMED: 'Confirmado',
        };
        return map[status] || status;
    }

    private translatePaymentStatus(status: string): string {
        const map = {
            UNPAID: 'Sin Pagar',
            PARTIALLY_PAID: 'Pago Parcial',
            PAID: 'Pagado',
        };
        return map[status] || status;
    }

    private translateMatchStatus(status: string): string {
        const map = {
            DRAFT: 'Borrador',
            CONFIRMED: 'Confirmado',
        };
        return map[status] || status;
    }

    private getDteTypeName(type: number): string {
        const map = {
            33: 'Factura',
            34: 'Factura Exenta',
            61: 'Nota Crédito',
            56: 'Nota Débito',
        };
        return map[type] || `Tipo ${type}`;
    }
}
