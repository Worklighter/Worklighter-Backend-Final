import FillableField from '../../core/interfaces/fillableFields';
import { GeneralFillables } from '../../core/interfaces/generalInterface';
import SubscriptionStatus from '../../core/enums/subscriptionStatus';
import BillingCycle from '../../core/enums/billingCycle';

export interface ISubscriptionMetadata {
    cardLast4?: string;
    cardBrand?: string;
    previousPlanId?: string;
    previousPlanName?: string;
    previousBillingCycle?: string;
}

export interface ISavedPaymentMethodSummary {
    id: string;
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
    isDefault?: boolean;
}

export interface IPendingSubscriptionChange {
    planId: string;
    planName?: string;
    billingCycle: BillingCycle;
    effectiveAt: Date;
    requestedAt: Date;
    previousPlanId: string;
    previousPlanName?: string;
    previousBillingCycle?: BillingCycle;
}

export interface ISubscription {
    _id?: string;
    tenantId: string;
    ownerId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    planId: string;
    planName?: string;
    billingCycle: BillingCycle;
    status: SubscriptionStatus;
    isActive: boolean;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd: boolean;
    stripeScheduleId?: string;
    pendingChange?: IPendingSubscriptionChange;
    supersededAt?: Date;
    metadata?: ISubscriptionMetadata;
    createdAt?: string;
    updatedAt?: string;
}

export interface IInitiateCheckoutDTO {
    planId: string;
    billingCycle: BillingCycle;
}

export interface IConfirmCheckoutDTO {
    setupIntentId: string;
}

export interface IReactivateSubscriptionDTO {
    planId: string;
    billingCycle: BillingCycle;
    paymentMethodId?: string;
}

export interface IGetSubscriptionDTO {
    tenantId: string;
}

export interface ICancelSubscriptionDTO {
    cancelImmediately?: boolean;
}

export interface IChangePlanDTO {
    planId: string;
    billingCycle: BillingCycle;
    effectiveImmediately?: boolean;
}

export interface IBillingSummary {
    activeSubscription: ISubscription | null;
    latestSubscription: ISubscription | null;
    stripeCustomerId: string | null;
    defaultPaymentMethodId: string | null;
    paymentMethods: ISavedPaymentMethodSummary[];
}

export const SubscriptionFillableFields: FillableField[] = [
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'ownerId', columnDataType: 'string' },
    { column: 'stripeCustomerId', columnDataType: 'string' },
    { column: 'stripeSubscriptionId', columnDataType: 'string' },
    { column: 'planId', columnDataType: 'string' },
    { column: 'planName', columnDataType: 'string' },
    { column: 'billingCycle', columnDataType: 'string' },
    { column: 'status', columnDataType: 'string' },
    { column: 'isActive', columnDataType: 'boolean' },
    { column: 'currentPeriodStart', columnDataType: 'string' },
    { column: 'currentPeriodEnd', columnDataType: 'string' },
    { column: 'cancelAtPeriodEnd', columnDataType: 'boolean' },
    { column: 'stripeScheduleId', columnDataType: 'string' },
    { column: 'pendingChange', columnDataType: 'object' },
    { column: 'supersededAt', columnDataType: 'string' },
    { column: 'metadata', columnDataType: 'object' },
    ...GeneralFillables
];

export const subscriptionResponseFields = [
    '_id',
    'tenantId',
    'ownerId',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'planId',
    'planName',
    'billingCycle',
    'status',
    'isActive',
    'currentPeriodStart',
    'currentPeriodEnd',
    'cancelAtPeriodEnd',
    'stripeScheduleId',
    'pendingChange',
    'supersededAt',
    'metadata',
    'createdAt',
    'updatedAt',
];
