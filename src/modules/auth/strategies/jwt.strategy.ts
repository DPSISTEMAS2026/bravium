import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'dev_secret',
        });
    }

    async validate(payload: any) {
        let organizationId = payload.organizationId;

        // Fallback para usuarios con tokens antiguos (generados antes de la migración)
        if (!organizationId) {
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                select: { organizationId: true }
            });
            organizationId = user?.organizationId;
        }

        return {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            organizationId: organizationId
        };
    }
}
