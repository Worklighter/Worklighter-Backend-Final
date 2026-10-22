import FillableField from '../../core/interfaces/fillableFields';
import { GeneralFillables } from '../../core/interfaces/generalInterface';
import PaymentStatus from '../../core/enums/paymentStatus';
import TransactionPurpose from '../../core/enums/transactionPurpose';

export interface ITransactionMetadata {
    purpose: TransactionPurpose;
    planId: string;
    planName: string;
    billingCycle: string;          // 'Monthly' | 'Yearly'
    periodStart?: string;          // ISO date string
    periodEnd?: string;            // ISO date string
    cardLast4?: string;            // Last 4 digits of the card used
    cardBrand?: string;            // e.g. 'visa', 'mastercard', 'amex'
    previousPlanId?: string;       // Populated for upgrades / downgrades
    previousPlanName?: string;
    previousBillingCycle?: string;
}

export interface ITransactionHistory {
    _id?: string;
    tenantId: string;
    subscriptionId?: string;
    stripePaymentIntentId: string;
    stripeInvoiceId?: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    purpose?: TransactionPurpose;
    metadata?: ITransactionMetadata;
    paidAt?: Date;
    failureReason?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface ICreateTransactionHistoryDTO {
    tenantId: string;
    subscriptionId?: string;
    stripePaymentIntentId: string;
    stripeInvoiceId?: string;
    amount: number;
    currency?: string;
    status: PaymentStatus;
    purpose?: TransactionPurpose;
    metadata?: ITransactionMetadata;
    paidAt?: Date;
    failureReason?: string | null;
}

export const TransactionHistoryFillableFields: FillableField[] = [
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'subscriptionId', columnDataType: 'string' },
    { column: 'stripePaymentIntentId', columnDataType: 'string' },
    { column: 'stripeInvoiceId', columnDataType: 'string' },
    { column: 'amount', columnDataType: 'number' },
    { column: 'currency', columnDataType: 'string' },
    { column: 'status', columnDataType: 'string' },
    { column: 'purpose', columnDataType: 'string' },
    { column: 'metadata', columnDataType: 'object' },
    { column: 'paidAt', columnDataType: 'string' },
    { column: 'failureReason', columnDataType: 'string' },
    ...GeneralFillables
];

export const transactionHistoryResponseFields = [
    '_id',
    'tenantId',
    'subscriptionId',
    'stripePaymentIntentId',
    'stripeInvoiceId',
    'amount',
    'currency',
    'status',
    'purpose',
    'metadata',
    'paidAt',
    'failureReason',
    'createdAt',
    'updatedAt',
];
