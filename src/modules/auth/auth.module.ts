import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'dev_secret',
            signOptions: { expiresIn: '8h' },
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy
    ],
    exports: [
        AuthService
    ],
})
export class AuthModule { }
