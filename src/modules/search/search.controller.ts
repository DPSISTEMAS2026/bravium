import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
    constructor(private readonly prisma: PrismaService) { }

    @Get('global')
    async globalSearch(@Query('q') query: string, @Req() req: any) {
        if (!query || query.trim().length < 2) {
            return { proveedores: [], dtes: [], transacciones: [] };
        }

        const q = query.trim();
        const orgId = req.user.organizationId;

        // 1. Buscar Proveedores
        const proveedores = await this.prisma.provider.findMany({
            where: {
                organizationId: orgId,
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { rut: { contains: q, mode: 'insensitive' } },
                ]
            },
            take: 15
        });

        // 2. Buscar DTEs (Facturas, Boletas BHE, Notas de Crédito 2020 - 2026)
        const folioNum = /^\d+$/.test(q) ? parseInt(q, 10) : NaN;
        const dtes = await this.prisma.dTE.findMany({
            where: {
                organizationId: orgId,
                OR: [
                    { rutIssuer: { contains: q, mode: 'insensitive' } },
                    { provider: { name: { contains: q, mode: 'insensitive' } } },
                    ...(!isNaN(folioNum) ? [{ folio: folioNum }] : [])
                ]
            },
            include: {
                provider: { select: { id: true, name: true, rut: true } },
                matches: {
                    include: {
                        transaction: {
                            select: {
                                id: true,
                                date: true,
                                amount: true,
                                description: true,
                                reference: true,
                                bankAccount: { select: { bankName: true, accountNumber: true } }
                            }
                        }
                    }
                }
            },
            take: 25,
            orderBy: { issuedDate: 'desc' }
        });

        // 3. Buscar Transacciones Bancarias (Cartolas)
        const transacciones = await this.prisma.bankTransaction.findMany({
            where: {
                bankAccount: { organizationId: orgId },
                OR: [
                    { description: { contains: q, mode: 'insensitive' } },
                    { reference: { contains: q, mode: 'insensitive' } },
                ]
            },
            include: {
                bankAccount: { select: { bankName: true, accountNumber: true } },
                matches: {
                    include: { dte: { select: { folio: true, totalAmount: true, rutIssuer: true, provider: { select: { name: true } } } } }
                }
            },
            take: 25,
            orderBy: { date: 'desc' }
        });

        return { proveedores, dtes, transacciones };
    }
}
