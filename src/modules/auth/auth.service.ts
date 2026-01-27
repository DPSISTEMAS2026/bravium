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

    async login(user: any) {
        const payload = {
            email: user.email,
            sub: user.id,
            role: user.role,
            organizationId: user.organizationId
        };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                organizationId: user.organizationId
            }
        };
    }

    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }
}
