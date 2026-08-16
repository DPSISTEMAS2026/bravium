import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DataVisibilityService } from '../../common/services/data-visibility.service';
import { ExcelLiveSyncService } from './excel-live-sync.service';
import { extractCommerceFromGlosa, isMarketplaceGlosa } from '../conciliacion/services/excel-pattern-learner.service';

export const AUTH_PENDIENTE = 'PENDIENTE_CARTOLA';
export const AUTH_CONFIRMADO = 'DOBLE_VERIFICADO';

export interface CreatePaymentRecordDto {
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

    constructor(
        private prisma: PrismaService,
        private excelLiveSync: ExcelLiveSyncService,
        private readonly visibility: DataVisibilityService,
    ) {}

    async create(dto: CreatePaymentRecordDto, userId?: string, organizationId?: string) {
        let transactionId: string | null = dto.transactionId || null;
        let dteId: string | null = dto.dteId || null;
        const fechaPago = new Date(dto.fechaPago.includes('T') ? dto.fechaPago : `${dto.fechaPago}T12:00:00`);
        const esGastoLibre = !dto.folioFactura && !dto.dteId && (dto.tipoDocumento === 'Gasto' || !dto.tipoDocumento);

        if (!dteId && dto.folioFactura) {
            const folioNum = parseInt(dto.folioFactura.trim(), 10);
            if (!isNaN(folioNum)) {
                const dteMatch = await this.prisma.dTE.findFirst({
                    where: {
                        folio: folioNum,
                        ...(organizationId ? { organizationId } : {}),
                    },
                    select: { id: true },
                });
                if (dteMatch) dteId = dteMatch.id;
            }
        }

        if (!dteId && !esGastoLibre && dto.monto > 0) {
            const dteMatch = await this.prisma.dTE.findFirst({
                where: {
                    totalAmount: Math.round(dto.monto),
                    paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                    ...(organizationId ? { organizationId } : {}),
                    provider: { name: { contains: dto.empresa.trim(), mode: 'insensitive' } },
                },
                select: { id: true },
            });
            if (dteMatch) dteId = dteMatch.id;
        }

        if (!transactionId && organizationId) {
            const hit = await this.findUniqueCartolaDebit(organizationId, fechaPago, dto.monto, dto.medioPago);
            if (hit) transactionId = hit.id;
        }

        const mesOrigen = `${fechaPago.getFullYear()}-${String(fechaPago.getMonth() + 1).padStart(2, '0')}`;
        const record = await this.prisma.paymentRecord.create({
            data: {
                empresa: dto.empresa.trim(),
                detalle: dto.detalle,
                tipoDocumento: dto.tipoDocumento || (esGastoLibre ? 'Gasto' : undefined),
                folioFactura: dto.folioFactura,
                folioBoleta: dto.folioBoleta,
                monto: Math.round(dto.monto),
                fechaPago,
                medioPago: dto.medioPago,
                comentario: dto.comentario,
                autorizacion: dto.autorizacion || (transactionId ? AUTH_CONFIRMADO : AUTH_PENDIENTE),
                mesOrigen,
                transactionId,
                dteId,
                createdBy: userId,
                organizationId: organizationId || null,
            },
            include: { transaction: true, dte: { include: { provider: true } } },
        });

        if (transactionId) {
            await this.stampTxFromPayment(transactionId, dto.empresa.trim());
        }

        await this.excelLiveSync.appendPaymentToExcel({
            empresa: dto.empresa,
            detalle: dto.detalle,
            tipoDocumento: dto.tipoDocumento || (esGastoLibre ? 'Gasto' : undefined),
            folioFactura: dto.folioFactura,
            folioBoleta: dto.folioBoleta,
            monto: dto.monto,
            fechaPago,
            medioPago: dto.medioPago,
            comentario: dto.comentario,
            rut: record.dte?.provider?.rut,
            autorizacion: record.autorizacion || AUTH_PENDIENTE,
            idMovimientoBanco: transactionId || undefined,
        });


        return record;
    }

    async list(filters?: {
        mes?: string;
        empresa?: string;
        vinculado?: string;
        page?: number;
        limit?: number;
        organizationId?: string;
        autorizacion?: string;
    }) {
        const where: Prisma.PaymentRecordWhereInput = {};
        if (filters?.organizationId) where.organizationId = filters.organizationId;

        if (filters?.mes) {
            const [y, m] = filters.mes.split('-').map(Number);
            where.fechaPago = {
                gte: new Date(Date.UTC(y, m - 1, 1)),
                lt: new Date(Date.UTC(y, m, 1)),
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

        if (filters?.autorizacion) where.autorizacion = filters.autorizacion;

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
                    dte: { select: { id: true, folio: true, totalAmount: true, issuedDate: true, provider: { select: { name: true, rut: true } } } },
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
                ...(dto.autorizacion !== undefined && { autorizacion: dto.autorizacion }),
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

            const txCandidates = await this.prisma.bankTransaction.findMany({
                where: {
                    date: {
                        gte: new Date(fechaPago.getTime() - 2 * 86400000),
                        lte: new Date(fechaPago.getTime() + 2 * 86400000),
                    },
                },
                select: { id: true, amount: true },
            });
            const absMonto = Math.abs(row.monto);
            const txMatch = txCandidates.find((tx) => Math.abs(Math.abs(tx.amount) - absMonto) <= 100);
            if (txMatch) {
                const alreadyLinked = await this.prisma.paymentRecord.findFirst({ where: { transactionId: txMatch.id } });
                if (!alreadyLinked) {
                    transactionId = txMatch.id;
                    linked++;
                }
            }

            if (row.folioFactura) {
                const folioNum = parseInt(row.folioFactura, 10);
                if (!isNaN(folioNum)) {
                    const dteMatch = await this.prisma.dTE.findFirst({ where: { folio: folioNum }, select: { id: true } });
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

    async getSummary(organizationId?: string) {
        const where: Prisma.PaymentRecordWhereInput = organizationId ? { organizationId } : {};
        const [total, linked, unlinked, pending, confirmed] = await Promise.all([
            this.prisma.paymentRecord.count({ where }),
            this.prisma.paymentRecord.count({ where: { ...where, transactionId: { not: null } } }),
            this.prisma.paymentRecord.count({ where: { ...where, transactionId: null } }),
            this.prisma.paymentRecord.count({ where: { ...where, autorizacion: AUTH_PENDIENTE } }),
            this.prisma.paymentRecord.count({ where: { ...where, autorizacion: AUTH_CONFIRMADO } }),
        ]);
        return { total, linked, unlinked, pendingCartola: pending, dobleVerificado: confirmed };
    }

    async getWeekQueue(organizationId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const msDay = 86400000;
        const issuedTo = new Date(today.getTime() - 16 * msDay);

        const alreadyDeclared = await this.prisma.paymentRecord.findMany({
            where: {
                organizationId,
                dteId: { not: null },
                autorizacion: { in: [AUTH_PENDIENTE, AUTH_CONFIRMADO] },
            },
            select: { dteId: true },
        });
        const declaredIds = new Set(alreadyDeclared.map((r) => r.dteId).filter(Boolean) as string[]);

        const minDate = this.visibility.getVisibleFromDate() ?? new Date('2026-01-01T00:00:00.000Z');
        const [dtes, ncs] = await Promise.all([
            this.prisma.dTE.findMany({
                where: {
                    organizationId,
                    type: { notIn: [61] },
                    paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                    issuedDate: { gte: minDate, lte: issuedTo },
                    NOT: { provider: { rut: { startsWith: 'HIST-' } } },
                },
                include: {
                    provider: {
                        select: {
                            id: true,
                            name: true,
                            rut: true,
                            transferBankName: true,
                            transferAccountNumber: true,
                            transferAccountType: true,
                            transferRut: true,
                            transferEmail: true,
                        },
                    },
                },
                orderBy: { issuedDate: 'asc' },
            }),
            this.prisma.dTE.findMany({
                where: { organizationId, type: 61, issuedDate: { gte: minDate } },
                select: { id: true, folio: true, totalAmount: true, rutIssuer: true, metadata: true },
            }),
        ]);

        const covered = new Set<string>();
        let ncWouldApply = 0;
        let ncSkippedMulti = 0;
        let ncSkippedAlready = 0;
        for (const nc of ncs) {
            const meta = (nc.metadata && typeof nc.metadata === 'object' && !Array.isArray(nc.metadata))
                ? nc.metadata as Record<string, any>
                : {};
            if (meta.ncAppliedToDteId) {
                ncSkippedAlready++;
                covered.add(String(meta.ncAppliedToDteId));
                continue;
            }
            const amt = Math.abs(nc.totalAmount || 0);
            const cands = dtes.filter((d) =>
                d.rutIssuer === nc.rutIssuer
                && Math.abs(Math.abs(d.outstandingAmount || d.totalAmount) - amt) <= 10
                && !covered.has(d.id),
            );
            if (cands.length === 1) {
                covered.add(cands[0].id);
                ncWouldApply++;
            } else if (cands.length > 1) ncSkippedMulti++;
        }
        const nc = { wouldApply: ncWouldApply, skippedAlready: ncSkippedAlready, skippedMulti: ncSkippedMulti, applied: 0 };

        const mapRow = (dte: (typeof dtes)[number]) => {
            const daysSinceIssue = Math.floor((today.getTime() - new Date(dte.issuedDate).getTime()) / msDay);
            const daysToDue = 30 - daysSinceIssue;
            const dueDate = new Date(dte.issuedDate);
            dueDate.setUTCDate(dueDate.getUTCDate() + 30);
            let bucket: 'vencido' | 'estaSemana' | 'proximo' = 'proximo';
            if (daysToDue < 0) bucket = 'vencido';
            else if (daysToDue <= 7) bucket = 'estaSemana';
            return {
                id: dte.id,
                folio: dte.folio,
                type: dte.type,
                totalAmount: dte.totalAmount,
                outstandingAmount: dte.outstandingAmount,
                issuedDate: dte.issuedDate,
                dueDate: dueDate.toISOString(),
                daysSinceIssue,
                daysToDue,
                bucket,
                alreadyDeclared: declaredIds.has(dte.id),
                provider: dte.provider,
            };
        };

        const rows = dtes.map(mapRow);
        const actionable = rows.filter((r) => !r.alreadyDeclared && !covered.has(r.id));
        const estaSemana = actionable.filter((r) => r.bucket === 'estaSemana');
        const vencido = actionable.filter((r) => r.bucket === 'vencido');
        const proximo = actionable.filter((r) => r.bucket === 'proximo');
        const sum = (list: typeof actionable) => list.reduce((s, r) => s + (r.outstandingAmount || r.totalAmount), 0);
        const providers = new Set(estaSemana.concat(vencido).map((r) => r.provider?.id).filter(Boolean));

        const summary = {
            estaSemana: { count: estaSemana.length, amount: sum(estaSemana) },
            vencido: { count: vencido.length, amount: sum(vencido) },
            proximo: { count: proximo.length, amount: sum(proximo) },
            providersToPay: providers.size,
            totalActionable: estaSemana.length + vencido.length,
            totalActionableAmount: sum(estaSemana) + sum(vencido),
        };

        // #region agent log
        try {
            const fs = require('fs');
            fs.appendFileSync('e:\\BRAVIUM-PRODUCCION\\.cursor\\debug-58a0b5.log', JSON.stringify({
                sessionId: '58a0b5', runId: 'retoma-dte-excel', hypothesisId: 'H4',
                location: 'payment-records.service.ts:getWeekQueue',
                message: 'week-queue structural',
                data: { minDate: minDate.toISOString().slice(0, 10), issuedTo: issuedTo.toISOString().slice(0, 10), fetched: dtes.length, hiddenByNc: covered.size, summary, nc },
                timestamp: Date.now(),
            }) + '\n');
        } catch { /* ignore */ }
        // #endregion

        return {
            asOf: today.toISOString().slice(0, 10),
            summary,
            nc,
            dtes: actionable,
        };
    }

    async suggestFolios(organizationId: string, q: string, providerId?: string) {
        const query = (q || '').trim();
        const minDate = this.visibility.getVisibleFromDate() ?? new Date('2026-01-01T00:00:00.000Z');
        const where: Prisma.DTEWhereInput = {
            organizationId,
            type: { notIn: [61] },
            paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
            issuedDate: { gte: minDate },
            NOT: { provider: { rut: { startsWith: 'HIST-' } } },
            ...(providerId ? { providerId } : {}),
        };

        const dtes = await this.prisma.dTE.findMany({
            where,
            include: { provider: { select: { id: true, name: true, rut: true, transferBankName: true, transferAccountNumber: true, transferAccountType: true } } },
            orderBy: { issuedDate: 'asc' },
            take: providerId ? 80 : 200,
        });

        const filtered = query
            ? dtes.filter((d) => String(d.folio).includes(query.replace(/^0+/, '') || query) || String(d.folio).padStart(5, '0').startsWith(query))
            : dtes;

        return filtered.slice(0, 20).map((d) => {
            const daysSinceIssue = Math.floor((Date.now() - new Date(d.issuedDate).getTime()) / 86400000);
            return {
                id: d.id,
                folio: d.folio,
                type: d.type,
                totalAmount: d.totalAmount,
                outstandingAmount: d.outstandingAmount,
                issuedDate: d.issuedDate,
                daysToDue: 30 - daysSinceIssue,
                provider: d.provider,
            };
        });
    }

    async declarePayments(
        body: {
            dteIds?: string[];
            fechaPago?: string;
            medioPago?: string;
            comentario?: string;
            detalle?: string;
        },
        userId: string,
        organizationId: string,
    ) {
        const dteIds = [...new Set((body.dteIds || []).filter(Boolean))];
        if (!dteIds.length) throw new BadRequestException('Selecciona al menos un folio');

        const dtes = await this.prisma.dTE.findMany({
            where: { id: { in: dteIds }, organizationId },
            include: { provider: true },
        });
        if (dtes.length !== dteIds.length) throw new NotFoundException('Uno o más folios no existen');

        const existing = await this.prisma.paymentRecord.findMany({
            where: {
                organizationId,
                dteId: { in: dteIds },
                autorizacion: { in: [AUTH_PENDIENTE, AUTH_CONFIRMADO] },
            },
            select: { dteId: true, folioFactura: true },
        });
        const already = new Set(existing.map((e) => e.dteId));
        const toCreate = dtes.filter((d) => !already.has(d.id) && d.type !== 61);
        if (!toCreate.length) {
            throw new BadRequestException('Esos folios ya están declarados (pendientes de cartola o confirmados).');
        }

        const fechaPago = body.fechaPago ? new Date(body.fechaPago) : new Date();
        const medio = body.medioPago || 'TRANSFERENCIA CUENTA SANTANDER';
        const created = [];

        for (const dte of toCreate) {
            const rec = await this.prisma.paymentRecord.create({
                data: {
                    empresa: dte.provider?.name || 'Proveedor',
                    detalle: body.detalle || `Folio ${dte.folio}`,
                    tipoDocumento: dte.type === 112 || dte.type === 39 ? 'Boleta' : 'Factura',
                    folioFactura: String(dte.folio),
                    monto: dte.outstandingAmount || dte.totalAmount,
                    fechaPago,
                    medioPago: medio,
                    comentario: body.comentario || 'Declarado en Libro de Pagos (pendiente cartola viernes)',
                    autorizacion: AUTH_PENDIENTE,
                    dteId: dte.id,
                    createdBy: userId,
                    organizationId,
                    mesOrigen: `${fechaPago.getUTCFullYear()}-${String(fechaPago.getUTCMonth() + 1).padStart(2, '0')}`,
                },
            });
            created.push({ ...rec, providerRut: dte.provider?.rut, providerName: dte.provider?.name });
        }

        const excel = await this.excelLiveSync.appendPaymentsToExcel(
            created.map((r) => ({
                empresa: r.empresa,
                detalle: r.detalle || undefined,
                tipoDocumento: r.tipoDocumento || undefined,
                folioFactura: r.folioFactura || undefined,
                monto: r.monto,
                fechaPago,
                medioPago: r.medioPago || undefined,
                comentario: r.comentario || undefined,
                rut: r.providerRut,
                autorizacion: AUTH_PENDIENTE,
            })),
        );

        const totalAmount = created.reduce((s, r) => s + r.monto, 0);
        this.logger.log(`Declarados ${created.length} pagos ($${totalAmount}) org=${organizationId} excel=${JSON.stringify(excel)}`);

        return {
            declared: created.length,
            skippedAlreadyDeclared: already.size,
            totalAmount,
            fechaPago: fechaPago.toISOString().slice(0, 10),
            excel,
            records: created.map((r) => ({
                id: r.id,
                empresa: r.empresa,
                folio: r.folioFactura,
                monto: r.monto,
                autorizacion: r.autorizacion,
            })),
        };
    }

    async confirmDeclaredAgainstCartola(organizationId: string, windowDays = 10) {
        const pending = await this.prisma.paymentRecord.findMany({
            where: { organizationId, autorizacion: AUTH_PENDIENTE, transactionId: null },
            include: {
                dte: {
                    include: {
                        provider: true,
                        matches: {
                            where: { status: 'CONFIRMED' },
                            include: { transaction: { select: { id: true, amount: true, description: true, date: true, type: true } } },
                        },
                    },
                },
            },
        });

        let confirmed = 0;
        const details: { folio: string | null; empresa: string; how: string; txId?: string }[] = [];

        for (const rec of pending) {
            const absMonto = Math.round(Math.abs(rec.monto));
            const confirmedTx = rec.dte?.matches
                ?.map((m) => m.transaction)
                .find((tx) => tx && tx.type === 'DEBIT' && Math.abs(Math.abs(tx.amount) - absMonto) <= 10);

            if (confirmedTx) {
                await this.prisma.paymentRecord.update({
                    where: { id: rec.id },
                    data: { transactionId: confirmedTx.id, autorizacion: AUTH_CONFIRMADO },
                });
                confirmed++;
                details.push({ folio: rec.folioFactura, empresa: rec.empresa, how: 'match-confirmado', txId: confirmedTx.id });
                continue;
            }

            const from = new Date(rec.fechaPago.getTime() - windowDays * 86400000);
            const to = new Date(rec.fechaPago.getTime() + windowDays * 86400000);
            const txs = await this.prisma.bankTransaction.findMany({
                where: {
                    bankAccount: { organizationId },
                    type: 'DEBIT',
                    date: { gte: from, lte: to },
                    amount: { lte: -(absMonto - 10), gte: -(absMonto + 10) },
                },
                select: { id: true, description: true, amount: true },
            });

            const used = await this.prisma.paymentRecord.findMany({
                where: { transactionId: { in: txs.map((t) => t.id) } },
                select: { transactionId: true },
            });
            const usedIds = new Set(used.map((u) => u.transactionId));
            const rutDigits = (rec.dte?.provider?.rut || '').replace(/\D/g, '');
            const name = (rec.dte?.provider?.name || rec.empresa || '').toUpperCase();
            const nameToken = name.split(/\s+/).filter((w) => w.length >= 4)[0];

            let hit = txs.find((tx) => {
                if (usedIds.has(tx.id)) return false;
                const desc = (tx.description || '').toUpperCase();
                const descDigits = desc.replace(/\D/g, '');
                if (rutDigits.length >= 6) {
                    const body = rutDigits.length >= 8 ? rutDigits.slice(0, -1) : rutDigits;
                    if (descDigits.includes(body)) return true;
                }
                if (nameToken && desc.includes(nameToken)) return true;
                return false;
            });

            if (!hit && !rec.dteId) {
                const free = txs.filter((tx) => !usedIds.has(tx.id));
                if (free.length === 1) {
                    hit = free[0];
                } else if (free.length > 1 && /tarjeta/i.test(rec.medioPago || '')) {
                    const mp = free.filter((tx) => isMarketplaceGlosa(tx.description || ''));
                    if (mp.length === 1) hit = mp[0];
                }
            }

            if (hit) {
                await this.prisma.paymentRecord.update({
                    where: { id: rec.id },
                    data: { transactionId: hit.id, autorizacion: AUTH_CONFIRMADO },
                });
                await this.stampTxFromPayment(hit.id, rec.empresa);
                confirmed++;
                details.push({
                    folio: rec.folioFactura,
                    empresa: rec.empresa,
                    how: rec.dteId ? 'glosa-monto' : 'monto-fecha',
                    txId: hit.id,
                });
            }
        }

        this.logger.log(`Doble confirmación cartola: ${confirmed}/${pending.length} org=${organizationId}`);
        return { pending: pending.length, confirmed, stillPending: pending.length - confirmed, details };
    }

    private async findUniqueCartolaDebit(
        organizationId: string,
        fechaPago: Date,
        monto: number,
        medioPago?: string,
    ) {
        const absMonto = Math.round(Math.abs(monto));
        const from = new Date(fechaPago.getTime() - 2 * 86400000);
        const to = new Date(fechaPago.getTime() + 2 * 86400000);
        const txs = await this.prisma.bankTransaction.findMany({
            where: {
                bankAccount: { organizationId },
                type: 'DEBIT',
                date: { gte: from, lte: to },
                amount: { lte: -(absMonto - 10), gte: -(absMonto + 10) },
            },
            select: {
                id: true,
                description: true,
                amount: true,
                date: true,
                matches: { where: { status: 'CONFIRMED' }, select: { id: true } },
            },
        });
        const used = await this.prisma.paymentRecord.findMany({
            where: { transactionId: { in: txs.map((t) => t.id) } },
            select: { transactionId: true },
        });
        const usedIds = new Set(used.map((u) => u.transactionId));
        let free = txs.filter((tx) => !usedIds.has(tx.id) && !(tx.matches || []).length);

        if (free.length > 1 && /tarjeta/i.test(medioPago || '')) {
            const mp = free.filter((tx) => isMarketplaceGlosa(tx.description || ''));
            if (mp.length === 1) free = mp;
        }


        return free.length === 1 ? free[0] : null;
    }

    /** Anota ítem Excel en la TX; el comercio de la glosa (Relani) queda aparte. */

    private async stampTxFromPayment(txId: string, empresa: string) {
        const tx = await this.prisma.bankTransaction.findUnique({ where: { id: txId } });
        if (!tx) return;
        const meta = typeof tx.metadata === 'object' && tx.metadata ? { ...(tx.metadata as Record<string, unknown>) } : {};
        meta.excelEmpresa = empresa;
        meta.autoCategorized = true;
        meta.category = empresa;
        meta.ruleName = empresa;
        meta.reviewNote = `[Excel: ${empresa}]`;
        const commerce = extractCommerceFromGlosa(tx.description || '');
        if (commerce) meta.commerceFromGlosa = commerce;
        await this.prisma.bankTransaction.update({
            where: { id: txId },
            data: { metadata: meta as Prisma.InputJsonValue },
        });
    }
}
