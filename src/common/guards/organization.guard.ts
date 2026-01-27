import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OrganizationGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const user = (request as any).user;

        if (!user || !user.organizationId) {
            throw new UnauthorizedException('Multi-tenancy context missing (Organization ID)');
        }

        // Attach organizationId to request for easy access in Controllers
        // This ensures all queries are filtered by this ID.
        (request as any).organizationId = user.organizationId;

        return true;
    }
}
