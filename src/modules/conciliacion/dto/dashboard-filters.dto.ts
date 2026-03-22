import { IsOptional, IsString, IsInt, Min, Max, IsArray, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum FilterStatus {
    ALL = 'ALL',
    PENDING = 'PENDING',
    MATCHED = 'MATCHED',
    CONFIRMED = 'CONFIRMED',
}

export class DashboardFiltersDto {
    @IsOptional()
    @IsString()
    organizationId?: string;

    @IsOptional()
    @IsInt()
    @Min(2020)
    @Max(2030)
    @Type(() => Number)
    year?: number;

    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(m => parseInt(m.trim(), 10)).filter(m => !isNaN(m));
        }
        return value;
    })
    @IsArray()
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(12, { each: true })
    months?: number[];

    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(id => id.trim());
        }
        return value;
    })
    @IsArray()
    @IsString({ each: true })
    providerIds?: string[];

    @IsOptional()
    @IsString()
    fromDate?: string;

    @IsOptional()
    @IsString()
    toDate?: string;

    @IsOptional()
    @IsEnum(FilterStatus)
    status?: FilterStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    minAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    maxAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;
}
