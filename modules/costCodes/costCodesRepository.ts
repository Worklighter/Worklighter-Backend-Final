import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";
// import { CostCodesSeed } from "./costCodesSeeder";
import { Logger } from "../../utils/helpers/logger";

/**
 * ╔═══════════════════════════════════════╗
 * ║      COST CODES REPOSITORY            ║
 * ╚═══════════════════════════════════════╝
 */

class CostCodesRepository extends BaseRepository {
    private static instance: CostCodesRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.COST_CODES, [
            { key: { codeNumber: 1, tenantId: 1 }, unique: true, partialFilterExpression: { deletedAt: null } },
            { key: { tenantId: 1 } },
            { key: { type: 1 } },
            { key: { isActive: 1 } },
            { key: { createdAt: -1 } }
        ]);
    }

    public static getInstance(): CostCodesRepository {
        if (!CostCodesRepository.instance) {
            CostCodesRepository.instance = new CostCodesRepository();
        }
        return CostCodesRepository.instance;
    }

    public async INIT() {
        await super.INIT();
       //await this.Seeder();
    }

    // private async Seeder() {
    //     try {
    //         // Check if standard codes already exist
    //         const standardCodesCount = await this.collection.countDocuments({ 
    //             type: 'standard',
    //             tenantId: 'system'
    //         });

    //         if (standardCodesCount === 0) {
    //             Logger.Console('💼 Seeding CSI MasterFormat cost codes...', 'info');
    //             await this.AddMany(CostCodesSeed);
    //             Logger.Console('✅ Cost codes seeded successfully', 'info');
    //         } else {
    //             Logger.Console('✓ CSI MasterFormat cost codes already loaded', 'info');
    //         }
    //     } catch (error) {
    //         Logger.Console(`❌ Error seeding cost codes: ${error.message}`, 'error');
    //     }
    // }
}

export default CostCodesRepository;