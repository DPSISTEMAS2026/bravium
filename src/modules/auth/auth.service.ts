import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (user && await bcrypt.compare(pass, user.passwordHash)) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    private buildPayload(user: { email: string; id: string; role: string; organizationId: string }) {
        return {
            email: user.email,
            sub: user.id,
            role: user.role,
            organizationId: user.organizationId,
        };
    }

    async login(user: any) {
        const payload = this.buildPayload(user);
        return {
            access_token: this.jwtService.sign(payload, { expiresIn: '1h' }),
            refresh_token: this.jwtService.sign(
                { ...payload, type: 'refresh' },
                { expiresIn: '7d' },
            ),
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                organizationId: user.organizationId,
            },
        };
    }

    /**
     * Validates a refresh token and issues a new access + refresh token pair.
     * This allows silent session renewal without forcing the user to log in again.
     */
    async refreshTokens(refreshToken: string) {
        try {
            const decoded = this.jwtService.verify(refreshToken);

            if (decoded.type !== 'refresh') {
                throw new UnauthorizedException('Token inválido');
            }

            // Verify user still exists and is active
            const user = await this.prisma.user.findUnique({
                where: { id: decoded.sub },
            });

            if (!user) {
                throw new UnauthorizedException('Usuario no encontrado');
            }

            const payload = this.buildPayload({
                email: user.email,
                id: user.id,
                role: user.role,
                organizationId: user.organizationId,
            });

            return {
                access_token: this.jwtService.sign(payload, { expiresIn: '1h' }),
                refresh_token: this.jwtService.sign(
                    { ...payload, type: 'refresh' },
                    { expiresIn: '7d' },
                ),
            };
        } catch (err) {
            throw new UnauthorizedException('Refresh token expirado o inválido. Inicie sesión nuevamente.');
        }
    }

    async changePassword(userId: string, oldPass: string, newPass: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('Usuario no encontrado');

        const isMatch = await bcrypt.compare(oldPass, user.passwordHash);
        if (!isMatch) throw new Error('Contraseña anterior incorrecta');

        const hash = await this.hashPassword(newPass);
        await this.prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hash }
        });

        return { success: true, message: 'Contraseña actualizada' };
    }

    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }
}
