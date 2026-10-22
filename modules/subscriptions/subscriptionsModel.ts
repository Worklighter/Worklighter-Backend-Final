import FillableField from '../../core/interfaces/fillableFields';
import BaseModel from '../../core/models/baseModel';
import { ISubscription, SubscriptionFillableFields } from './subscriptionsInterface';

abstract class SubscriptionsModel extends BaseModel<ISubscription> {
    protected static getFillable(): FillableField[] {
        return SubscriptionFillableFields;
    }

    public static create(data: Partial<ISubscription>): ISubscription {
        const fillables = this.getFillable();
        return this.fill(data, fillables) as ISubscription;
    }
}

export default SubscriptionsModel;
