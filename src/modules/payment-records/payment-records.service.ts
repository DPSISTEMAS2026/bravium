import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreatePaymentRecordDto {
    empresa: string;
    detalle?: string;
    tipoDocumento?: string;
    folioFactura?: string;
    folioBoleta?: string;
    monto: number;
    fechaPago: string; // ISO date
    medioPago?: string;
    comentario?: string;
    autorizacion?: string;
    transactionId?: string;
    dteId?: string;
}

export interface ImportExcelRowDto {
    empresa: string;
    detalle?: string;
    tipoDocumento?: string;
    folioFactura?: string;
    folioBoleta?: string;
    monto: number;
    fechaPago: string;
    medioPago?: string;
    comentario?: string;
    autorizacion?: string;
    mesOrigen?: string;
}

@Injectable()
export class PaymentRecordsService {
    private readonly logger = new Logger(PaymentRecordsService.name);

    constructor(private prisma: PrismaService) {}

    async create(dto: CreatePaymentRecordDto, userId?: string) {
        const record = await this.prisma.paymentRecord.create({
            data: {
                empresa: dto.empresa,
                detalle: dto.detalle,
                tipoDocumento: dto.tipoDocumento,
                folioFactura: dto.folioFactura,
                folioBoleta: dto.folioBoleta,
                monto: dto.monto,
                fechaPago: new Date(dto.fechaPago),
                medioPago: dto.medioPago,
                comentario: dto.comentario,
                autorizacion: dto.autorizacion,
                transactionId: dto.transactionId || null,
                dteId: dto.dteId || null,
                createdBy: userId,
            },
            include: { transaction: true, dte: true },
        });
        return record;
    }

    async list(filters?: {
        mes?: string;
        empresa?: string;
        vinculado?: string;
        page?: number;
        limit?: number;
    }) {
        const where: Prisma.PaymentRecordWhereInput = {};

        if (filters?.mes) {
            const [y, m] = filters.mes.split('-').map(Number);
            where.fechaPago = {
                gte: new Date(y, m - 1, 1),
                lt: new Date(y, m, 1),
            };
        }

        if (filters?.empresa) {
            where.empresa = { contains: filters.empresa, mode: 'insensitive' };
        }

        if (filters?.vinculado === 'si') {
            where.transactionId = { not: null };
        } else if (filters?.vinculado === 'no') {
            where.transactionId = null;
        }

        const page = filters?.page || 1;
        const limit = filters?.limit || 50;

        const [records, total] = await Promise.all([
            this.prisma.paymentRecord.findMany({
                where,
                orderBy: { fechaPago: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    transaction: { select: { id: true, description: true, amount: true, date: true, status: true } },
                    dte: { select: { id: true, folio: true, totalAmount: true, issuedDate: true, provider: { select: { name: true } } } },
                },
            }),
            this.prisma.paymentRecord.count({ where }),
        ]);

        return { records, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async update(id: string, dto: Partial<CreatePaymentRecordDto>) {
        const existing = await this.prisma.paymentRecord.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Registro no encontrado');

        return this.prisma.paymentRecord.update({
            where: { id },
            data: {
                ...(dto.empresa && { empresa: dto.empresa }),
                ...(dto.detalle !== undefined && { detalle: dto.detalle }),
                ...(dto.comentario !== undefined && { comentario: dto.comentario }),
                ...(dto.transactionId !== undefined && { transactionId: dto.transactionId || null }),
                ...(dto.dteId !== undefined && { dteId: dto.dteId || null }),
                ...(dto.medioPago && { medioPago: dto.medioPago }),
                ...(dto.folioFactura !== undefined && { folioFactura: dto.folioFactura }),
            },
            include: { transaction: true, dte: true },
        });
    }

    async delete(id: string) {
        await this.prisma.paymentRecord.delete({ where: { id } });
        return { success: true };
    }

    async importFromExcel(rows: ImportExcelRowDto[]): Promise<{ imported: number; linked: number; dteLinked: number }> {
        let imported = 0;
        let linked = 0;
        let dteLinked = 0;

        for (const row of rows) {
            if (!row.empresa || !row.monto) continue;

            const fechaPago = new Date(row.fechaPago);
            if (isNaN(fechaPago.getTime())) continue;

            let transactionId: string | null = null;
            let dteId: string | null = null;

            // Try to link to bank transaction by amount + date (±2 days)
            const txCandidates = await this.prisma.bankTransaction.findMany({
                where: {
                    date: {
                        gte: new Date(fechaPago.getTime() - 2 * 86400000),
                        lte: new Date(fechaPago.getTime() + 2 * 86400000),
                    },
                },
                select: { id: true, amount: true, date: true, description: true },
            });

            const absMonto = Math.abs(row.monto);
            const txMatch = txCandidates.find(
                (tx) => Math.abs(Math.abs(tx.amount) - absMonto) <= 100,
            );
            if (txMatch) {
                const alreadyLinked = await this.prisma.paymentRecord.findFirst({
                    where: { transactionId: txMatch.id },
                });
                if (!alreadyLinked) {
                    transactionId = txMatch.id;
                    linked++;
                }
            }

            // Try to link to DTE by folio number
            if (row.folioFactura) {
                const folioNum = parseInt(row.folioFactura, 10);
                if (!isNaN(folioNum)) {
                    const dteMatch = await this.prisma.dTE.findFirst({
                        where: { folio: folioNum },
                        select: { id: true },
                    });
                    if (dteMatch) {
                        dteId = dteMatch.id;
                        dteLinked++;
                    }
                }
            }

            await this.prisma.paymentRecord.create({
                data: {
                    empresa: row.empresa,
                    detalle: row.detalle,
                    tipoDocumento: row.tipoDocumento,
                    folioFactura: row.folioFactura,
                    folioBoleta: row.folioBoleta,
                    monto: row.monto,
                    fechaPago,
                    medioPago: row.medioPago,
                    comentario: row.comentario,
                    autorizacion: row.autorizacion,
                    mesOrigen: row.mesOrigen,
                    transactionId,
                    dteId,
                },
            });
            imported++;
        }

        return { imported, linked, dteLinked };
    }

    async getSummary() {
        const [total, linked, unlinked, byMonth] = await Promise.all([
            this.prisma.paymentRecord.count(),
            this.prisma.paymentRecord.count({ where: { transactionId: { not: null } } }),
            this.prisma.paymentRecord.count({ where: { transactionId: null } }),
            this.prisma.$queryRaw<any[]>`
                SELECT TO_CHAR("fechaPago", 'YYYY-MM') as mes,
                       COUNT(*)::int as total,
                       COUNT("transactionId")::int as vinculados,
                       SUM(monto)::float as monto_total
                FROM payment_records
                GROUP BY TO_CHAR("fechaPago", 'YYYY-MM')
                ORDER BY mes DESC
            `,
        ]);

        return { total, linked, unlinked, byMonth };
    }
}
