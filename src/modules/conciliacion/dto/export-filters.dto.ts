import { IsEnum, IsOptional } from 'class-validator';
import { DashboardFiltersDto } from './dashboard-filters.dto';

export enum ExportType {
    TRANSACTIONS = 'transactions',
    DTES = 'dtes',
    MATCHES = 'matches',
    ALL = 'all',
}

export class ExportFiltersDto extends DashboardFiltersDto {
    @IsEnum(ExportType)
    type: ExportType;
}
