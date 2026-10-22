import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";
import { PlansSeed } from "./plansSeeder";
import { Logger } from "../../utils/helpers/logger";

class PlansRepository extends BaseRepository {
    private static instance: PlansRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.PLANS, [
            { key: { planId: 1 }, unique: true },
            { key: { displayOrder: 1 } },
            { key: { isActive: 1 } },
            { key: { isPublic: 1 } }
        ]);
    }

    public static getInstance(): PlansRepository {
        if (!PlansRepository.instance) {
            PlansRepository.instance = new PlansRepository();
        }
        return PlansRepository.instance;
    }

    public async INIT() {
        await super.INIT();
        await this.Seeder();
    }

    private async Seeder() {
        try {
            Logger.Console('💳 Syncing subscription plans...', 'info');

            const planIds = PlansSeed.map((p) => p.planId).filter(Boolean);
            const bulkOps = PlansSeed.map((plan) => ({
                updateOne: {
                    filter: { planId: plan.planId },
                    update: { $set: plan },
                    upsert: true
                }
            }));

            if (bulkOps.length > 0) {
                await this.collection.bulkWrite(bulkOps);
            }

            // Remove any plans not in the seed list
            if (planIds.length > 0) {
                await this.collection.deleteMany({ planId: { $nin: planIds } });
            }

            Logger.Console('✅ Subscription plans synced successfully', 'info');
        } catch (error) {
            Logger.Console(`❌ Error seeding plans: ${error.message}`, 'error');
        }
    }
}

export { PlansRepository };
