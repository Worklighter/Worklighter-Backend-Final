import BaseRepository from '../../core/repositories/baseRepository';
import { MONGODB_COLLECTIONS } from '../../utils/constants';
import { standardWCCodes } from './wcCodesSeeder';

/**
 * ╔═══════════════════════════════════════╗
 * ║     WC CODES REPOSITORY               ║
 * ╚═══════════════════════════════════════╝
 */

class WCCodesRepository extends BaseRepository {
    private static instance: WCCodesRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.WC_CODES, [
            { key: { codeNumber: 1, tenantId: 1 }, unique: true, partialFilterExpression: { deletedAt: null } },
            { key: { tenantId: 1 } },
            { key: { type: 1 } },
            { key: { isActive: 1 } },
            { key: { createdAt: -1 } }
        ]);
    }

    public static getInstance(): WCCodesRepository {
        if (!WCCodesRepository.instance) {
            WCCodesRepository.instance = new WCCodesRepository();
        }
        return WCCodesRepository.instance;
    }

    /**
     * Initialize collection and seed standard WC codes
     * Called from app.ts during application startup
     */
    public async INIT(): Promise<void> {
        try {
            // Call parent INIT to initialize collection
            await super.INIT();

            // Seed standard codes if not already present
            const existingCount = await this.Count([
                { param: 'tenantId', value: 'system', operator: 'AND' as any }
            ]);

            if (existingCount === 0) {
                console.log('🌱 Seeding industry-standard WC codes...');
                
                await this.AddMany(standardWCCodes);
                
                console.log(`✅ Successfully seeded ${standardWCCodes.length} industry-standard WC codes`);
            } else {
                console.log(`✅ Industry-standard WC codes already exist (${existingCount} found)`);
            }
        } catch (error) {
            console.error('❌ Error initializing WC Codes:', error);
            throw error;
        }
    }
}

export default WCCodesRepository;
