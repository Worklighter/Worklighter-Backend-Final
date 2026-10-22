import FillableField from '../../core/interfaces/fillableFields';
import BaseModel from '../../core/models/baseModel';
import { ITransactionHistory, TransactionHistoryFillableFields } from './transactionHistoryInterface';

abstract class TransactionHistoryModel extends BaseModel<ITransactionHistory> {
    protected static getFillable(): FillableField[] {
        return TransactionHistoryFillableFields;
    }

    public static create(data: Partial<ITransactionHistory>): ITransactionHistory {
        const fillables = this.getFillable();
        return this.fill(data, fillables) as ITransactionHistory;
    }
}

export default TransactionHistoryModel;
