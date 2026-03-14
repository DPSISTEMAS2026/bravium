import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DataVisibilityService {
    private readonly visibleFrom: Date | null;

    constructor(private config: ConfigService) {
        const raw = this.config.get<string>('DATA_VISIBLE_FROM');
        this.visibleFrom = raw ? new Date(raw) : null;
    }

    getVisibleFromDate(): Date | null {
        return this.visibleFrom;
    }

    applyMinDate(currentGte: Date | undefined): Date | undefined {
        if (!this.visibleFrom) return currentGte;
        if (!currentGte) return this.visibleFrom;
        return currentGte > this.visibleFrom ? currentGte : this.visibleFrom;
    }
}
