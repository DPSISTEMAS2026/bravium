import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class OrganizationsService {
    constructor(private prisma: PrismaService) {}

    /**
     * Public branding info for login screen (no auth required)
     */
    async getBranding(slug: string) {
        const org = await this.prisma.organization.findUnique({
            where: { slug },
            select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                primaryColor: true,
                isActive: true,
            },
        });

        if (!org || !org.isActive) {
            throw new NotFoundException('Organization not found');
        }

        return {
            name: org.name,
            slug: org.slug,
            logoUrl: org.logoUrl,
            primaryColor: org.primaryColor,
        };
    }

    /**
     * Get full org config (auth required, admin only)
     */
    async getOrgConfig(organizationId: string) {
        return this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                rut: true,
                slug: true,
                plan: true,
                logoUrl: true,
                primaryColor: true,
                isActive: true,
                libreDteRut: true,
                googleDriveFolderId: true,
                dataVisibleFrom: true,
                // Never expose API keys/credentials
            },
        });
    }
}
