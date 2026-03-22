import { Controller, Get, Param } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
    constructor(private readonly orgsService: OrganizationsService) {}

    /**
     * PUBLIC endpoint - no auth required
     * Used by the login page to load org branding by subdomain slug
     * GET /organizations/branding/bravium
     */
    @Get('branding/:slug')
    async getBranding(@Param('slug') slug: string) {
        return this.orgsService.getBranding(slug);
    }
}
