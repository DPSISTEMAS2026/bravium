import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class PagoMasivoExportService {
    private readonly logger = new Logger(PagoMasivoExportService.name);

    constructor(private prisma: PrismaService) {}

    async exportPagoMasivo(organizationId?: string): Promise<Buffer> {
        const providers = await this.prisma.provider.findMany({
            where: {
                dtes: { some: { paymentStatus: 'UNPAID' } },
                ...(organizationId ? { organizationId } : {}),
            },
            include: {
                dtes: {
                    where: { paymentStatus: 'UNPAID' },
                    select: {
                        id: true,
                        folio: true,
                        type: true,
                        totalAmount: true,
                        outstandingAmount: true,
                        issuedDate: true,
                        dueDate: true,
                    },
                },
            },
        });

        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Pago Masivo');

        sheet.columns = [
            { header: 'RUT Proveedor', key: 'rut', width: 16 },
            { header: 'Nombre Proveedor', key: 'name', width: 30 },
            { header: 'Banco Destino', key: 'bank', width: 18 },
            { header: 'Tipo Cuenta', key: 'accountType', width: 14 },
            { header: 'N° Cuenta', key: 'accountNumber', width: 20 },
            { header: 'RUT Titular', key: 'holderRut', width: 16 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Monto a Pagar', key: 'amount', width: 16 },
            { header: 'N° Facturas', key: 'invoiceCount', width: 14 },
            { header: 'Folios', key: 'folios', width: 30 },
        ];

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        headerRow.alignment = { horizontal: 'center' };

        for (const provider of providers) {
            const totalToPay = provider.dtes.reduce((s, d) => s + d.outstandingAmount, 0);
            const folios = provider.dtes.map(d => d.folio).join(', ');

            sheet.addRow({
                rut: provider.rut,
                name: provider.name,
                bank: provider.transferBankName || '',
                accountType: provider.transferAccountType || '',
                accountNumber: provider.transferAccountNumber || '',
                holderRut: provider.transferRut || provider.rut,
                email: provider.transferEmail || '',
                amount: totalToPay,
                invoiceCount: provider.dtes.length,
                folios,
            });
        }

        const amountCol = sheet.getColumn('amount');
        amountCol.numFmt = '#,##0';

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    async getSummary(organizationId?: string) {
        const providers = await this.prisma.provider.findMany({
            where: {
                dtes: { some: { paymentStatus: 'UNPAID' } },
                ...(organizationId ? { organizationId } : {}),
            },
            include: {
                dtes: {
                    where: { paymentStatus: 'UNPAID' },
                    select: { outstandingAmount: true },
                },
            },
        });

        const totalProviders = providers.length;
        const totalAmount = providers.reduce(
            (sum, p) => sum + p.dtes.reduce((s, d) => s + d.outstandingAmount, 0),
            0,
        );
        const withBankData = providers.filter(
            (p) => p.transferBankName && p.transferAccountNumber,
        ).length;

        return {
            totalProviders,
            totalAmount,
            withBankData,
            withoutBankData: totalProviders - withBankData,
        };
    }
}
