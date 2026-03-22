import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const user = (request as any).user;

        if (!user || !user.organizationId) {
            throw new UnauthorizedException('Multi-tenancy context missing (Organization ID)');
        }

        // Validar el estado de la suscripción (Activo / Suspendido por pago)
        const organization = await this.prisma.organization.findUnique({
            where: { id: user.organizationId },
            select: { isActive: true }
        });

        if (!organization) {
            throw new UnauthorizedException('Organización vinculada no encontrada');
        }

        if (!organization.isActive) {
            throw new ForbiddenException('Servicio suspendido. Por favor, regularizar pago de mensualidad.');
        }

        // Attach organizationId to request for easy access in Controllers
        (request as any).organizationId = user.organizationId;

        return true;
    }
}
