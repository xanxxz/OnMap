import { PrismaService } from '../database/prisma.service';
export declare class HealthController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getHealth(): Promise<{
        status: string;
        service: string;
        database: string;
        postgis: string;
        timestamp: string;
    }>;
}
