import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('login')
    async login(@Body() body: any) {
        const user = await this.authService.validateUser(body.email, body.password);
        if (!user) {
            return { error: 'Invalid credentials' };
        }
        return this.authService.login(user);
    }

    /**
     * Silent token refresh: exchange a valid refresh_token for a new token pair.
     * No JWT guard needed — we validate the refresh token inside the service.
     */
    @Post('refresh')
    async refresh(@Body() body: { refresh_token: string }) {
        if (!body.refresh_token) {
            return { error: 'refresh_token requerido' };
        }
        return this.authService.refreshTokens(body.refresh_token);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(@Request() req, @Body() body: any) {
        if (!body.oldPassword || !body.newPassword) {
            return { error: 'Se requiere contraseña anterior y nueva' };
        }
        try {
            return await this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword);
        } catch (err: any) {
            return { error: err.message || 'Error al actualizar contraseña' };
        }
    }
}
