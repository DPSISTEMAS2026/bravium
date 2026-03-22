# DP Sistemas - Multi-Tenancy Architecture

## Overview
DP Sistemas is a multi-tenant SaaS platform built with NestJS (Backend) and Next.js (Frontend), using a single-database PostgreSQL approach via Prisma.

Data is partitioned logically by `organizationId`. This isolates different tenants (companies) from each other while minimizing infrastructure overhead.

## Tenancy Strategy
We use **Row-Level Tenancy (RLT)**. 
- All tables that contain tenant-specific data must have an `organizationId` foreign key.
- The `Organization` model is the core table representing a tenant.
- A single instance of the application handles all traffic.
- Requests are scoped automatically to a tenant's data to prevent cross-tenant leaks.

## Identity & Authentication
- Every `User` belongs to an `Organization`.
- When a user logs in, their JWT token encodes the `organizationId`.
- The NestJS internal guards/interceptors (or Prisma middleware) automatically filter queries by this ID.

## Dynamic Branding & Subdomains
- Organizations are assigned a `slug`, which corresponds to their access URL (e.g. `bravium.dpsistemas.cl`).
- The generic `LoginPage` detects the tenant via `window.location.hostname`.
- Before the user logs in, the public backend endpoint `GET /organizations/branding/:slug` provides the logo and company colors.
- Accessing the root domain without a slug loads the generic "DP Sistemas" platform branding.

## Per-Tenant Credentials
Credentials that differ per tenant are stored securely in the `Organization` table rather than glob-wide `.env` files. This includes:
- `libreDteApiKey`: To issue or read electronic invoices (DTE).
- `googleDriveFolderId`: For fetching Cartolas or specific tenant PDF inputs.

*(In production, these sensitive strings must be encrypted at rest or placed in a Vault-like service mapped by `organizationId`)*.
