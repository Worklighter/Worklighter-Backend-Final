import BaseRepository from '../../core/repositories/baseRepository';
import { MONGODB_COLLECTIONS } from '../../utils/constants';

class TransactionHistoryRepository extends BaseRepository {
    private static instance: TransactionHistoryRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.TRANSACTION_HISTORY, [
            { key: { tenantId: 1 } },
            { key: { subscriptionId: 1 } },
            { key: { stripePaymentIntentId: 1 }, unique: true },
            { key: { createdAt: -1 } },
        ]);
    }

    public static getInstance(): TransactionHistoryRepository {
        if (!TransactionHistoryRepository.instance) {
            TransactionHistoryRepository.instance = new TransactionHistoryRepository();
        }
        return TransactionHistoryRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}

export default TransactionHistoryRepository;
