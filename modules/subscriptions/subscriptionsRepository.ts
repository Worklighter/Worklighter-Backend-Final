import BaseRepository from '../../core/repositories/baseRepository';
import { MONGODB_COLLECTIONS } from '../../utils/constants';

class SubscriptionsRepository extends BaseRepository {
    private static instance: SubscriptionsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.SUBSCRIPTIONS, [
            { key: { tenantId: 1, isActive: 1 } },
            { key: { stripeSubscriptionId: 1 }, unique: true, sparse: true },
            { key: { stripeCustomerId: 1 } },
            { key: { createdAt: -1 } },
        ]);
    }

    public static getInstance(): SubscriptionsRepository {
        if (!SubscriptionsRepository.instance) {
            SubscriptionsRepository.instance = new SubscriptionsRepository();
        }
        return SubscriptionsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}

export default SubscriptionsRepository;
