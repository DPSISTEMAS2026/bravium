import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_VISIBLE_FROM = '2026-01-01';

@Injectable()
export class DataVisibilityService {
    private readonly visibleFrom: Date;

    constructor(private config: ConfigService) {
        const raw = this.config.get<string>('DATA_VISIBLE_FROM');
        this.visibleFrom = new Date((raw && raw.trim()) ? raw : DEFAULT_VISIBLE_FROM);
    }

    getVisibleFromDate(): Date | null {
        return this.visibleFrom;
    }

    /**
     * Sin fecha explícita: KPIs e informes parten en 2026-01-01 (no mezclar dic-2025 hacia atrás).
     * Con fromDate del usuario: se respeta (listados históricos siguen disponibles).
     */
    applyMinDate(currentGte: Date | undefined): Date | undefined {
        if (!currentGte) return this.visibleFrom;
        return currentGte;
    }
}
