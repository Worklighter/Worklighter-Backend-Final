import TransactionHistoryRepository from './transactionHistoryRepository';
import TransactionHistoryModel from './transactionHistoryModel';
import {
    ICreateTransactionHistoryDTO,
    ITransactionHistory,
    transactionHistoryResponseFields,
} from './transactionHistoryInterface';
import { Utils } from '../../utils/utils';
import QueryOperators from '../../core/enums/queryOperators';

class TransactionHistoryService {
    private static instance: TransactionHistoryService;
    private repository: TransactionHistoryRepository;

    private constructor() {
        this.repository = TransactionHistoryRepository.getInstance();
    }

    public static getInstance(): TransactionHistoryService {
        if (!TransactionHistoryService.instance) {
            TransactionHistoryService.instance = new TransactionHistoryService();
        }
        return TransactionHistoryService.instance;
    }

    public async create(dto: ICreateTransactionHistoryDTO): Promise<ITransactionHistory> {
        const data = TransactionHistoryModel.create({
            ...dto,
            currency: dto.currency || 'usd',
            createdAt: Utils.getCurrentDate(),
        });
        return await this.repository.Add(data, transactionHistoryResponseFields) as ITransactionHistory;
    }

    public async findByStripePaymentIntentId(stripePaymentIntentId: string): Promise<ITransactionHistory | null> {
        return await this.repository.GetOneByParam<ITransactionHistory | null>(
            { param: 'stripePaymentIntentId', value: stripePaymentIntentId },
            transactionHistoryResponseFields,
        );
    }

    public async listByTenant(tenantId: string, continuationToken = 0, pageSize = 20): Promise<{ data: ITransactionHistory[]; total: number }> {
        const queryParams = [
            { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
        ];
        const [result, total] = await Promise.all([
            this.repository.GetAll(queryParams, true, continuationToken, pageSize, { createdAt: -1 }, transactionHistoryResponseFields) as any,
            this.repository.Count(queryParams),
        ]);
        return { data: result.data ?? result, total };
    }
}

export default TransactionHistoryService;
