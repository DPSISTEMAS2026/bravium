import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionType } from '@prisma/client';

export interface N8nPayload {
    source: 'EMAIL' | 'DRIVE';
    documentType: 'CARTOLA' | 'DTE' | 'RECEIPT';
    data: any; // The parsed JSON content of the file
    metadata: {
        sender?: string;
        subject?: string;
        receivedAt: string;
        filename: string;
    };
}

@Controller('ingest/n8n')
export class AutomatedIngestController {
    private readonly logger = new Logger(AutomatedIngestController.name);

    constructor(private prisma: PrismaService) { }

    @Post('webhook')
    async handleN8nWebhook(@Body() payload: N8nPayload) {
        this.logger.log(`Received N8n payload: ${payload.documentType} from ${payload.source}`);

        // Dispatch based on type
        if (payload.documentType === 'CARTOLA') {
            return this.processCartola(payload);
        }
        // Handle DTEs, etc.

        return { status: 'RECEIVED' };
    }

    private async processCartola(payload: N8nPayload) {
        // Inspect rows from payload.data.rows (assuming n8n parsed Excel/CSV)
        const rows = payload.data.rows || [];
        let count = 0;

        // Find Target Account (maybe from payload or heuristic)
        const bankAccount = await this.prisma.bankAccount.findFirst();
        if (!bankAccount) throw new Error('No Bank Account configured');

        for (const row of rows) {
            // Create BankTransaction
            await this.prisma.bankTransaction.create({
                data: {
                    bankAccountId: bankAccount.id,
                    date: new Date(row.date),
                    amount: row.amount, // Ensure correct sign logic
                    description: row.description,
                    reference: row.reference,
                    type: row.amount >= 0 ? 'CREDIT' : 'DEBIT',
                    origin: DataOrigin.N8N_AUTOMATION,
                    metadata: {
                        sourceEmail: payload.metadata.sender,
                        importId: payload.metadata.subject
                    }
                }
            });
            count++;
        }

        return { processed: count };
    }
}
