import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);

        // If no roles are required, allow access
        if (!requiredRoles) {
            return true;
        }

        // Get Request Object (attached by AuthGuard previously)
        const { user } = context.switchToHttp().getRequest();

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        // Role Check
        const hasRole = requiredRoles.includes(user.role);
        if (!hasRole) {
            throw new ForbiddenException(`Rol insuficiente. Requerido: ${requiredRoles.join(', ')}`);
        }

        return true;
    }
}
