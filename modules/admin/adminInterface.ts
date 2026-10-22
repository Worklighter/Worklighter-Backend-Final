import Joi from 'joi';
import TenantStatus from '../../core/enums/tenantStatus';
import SubscriptionStatus from '../../core/enums/subscriptionStatus';
import BillingCycle from '../../core/enums/billingCycle';
import PaymentStatus from '../../core/enums/paymentStatus';
import { IPlan } from '../plans/plansInterface';
import { ICompany } from '../company/companyInterface';
import { ISubscription } from '../subscriptions/subscriptionsInterface';

export interface IAdminTenantSummary {
    tenantId: string;
    companyId: string;
    companyName: string;
    adminEmail: string;
    planType: string;
    status: TenantStatus | string;
    subscriptionStatus: SubscriptionStatus | string | null;
    lastActivityDate: string | null;
    activeUsers: number;
    totalUsers: number;
    ownerId: string;
}

export interface IAdminTenantDetail extends IAdminTenantSummary {
    company: Partial<ICompany>;
    users: IAdminUserRow[];
    subscription: Partial<ISubscription> | null;
    billing: IAdminBillingRow | null;
    plan: Partial<IPlan> | null;
}

export interface IAdminBillingRow {
    tenantId: string;
    companyName: string;
    adminEmail: string;
    planType: string;
    billingCycle: BillingCycle | string | null;
    subscriptionStatus: SubscriptionStatus | string | null;
    paymentStatus: PaymentStatus | string | null;
    amount: number;
    currency: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    lastPaymentDate: string | null;
    isActive: boolean;
    cancelAtPeriodEnd: boolean;
    pendingChange: Record<string, unknown> | null;
    canTerminate: boolean;
}

export interface IAdminUserRow {
    userId: string;
    tenantId: string;
    tenantName: string;
    email: string;
    name: string;
    role: string;
    status: string;
    activeTokenCount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface IAdminPlanInput {
    planId: string;
    name: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    currency: string;
    discountPercentage: number;
    stripePriceId?: string | null;
    stripePriceIdYearly?: string | null;
    badge?: string | null;
    buttonText: string;
    buttonStyle: 'primary' | 'secondary';
    displayOrder: number;
    availabilityStatus?: 'available' | 'roadmap';
    priceLabel?: string | null;
    trialDays: number;
    features: Array<Record<string, any>>;
    limits: Record<string, any>;
    isActive: boolean;
    isPublic: boolean;
}

export interface IAdminTenantStatusInput {
    status: TenantStatus;
    reason?: string | null;
}

export interface IAdminTenantsQuery {
    searchText?: string | null;
    status?: TenantStatus | 'All' | null;
    planType?: string | null;
    continuationToken?: number | string | null;
    pageSize?: number | string | null;
}

export interface IAdminUsersQuery {
    searchText?: string | null;
    tenantId?: string | null;
    status?: string | null;
    continuationToken?: number | string | null;
    pageSize?: number | string | null;
}

export interface IAdminBillingQuery {
    searchText?: string | null;
    status?: string | null;
    continuationToken?: number | string | null;
    pageSize?: number | string | null;
}

export const adminPlanResponseFields = [
    '_id',
    'planId',
    'name',
    'description',
    'monthlyPrice',
    'yearlyPrice',
    'currency',
    'discountPercentage',
    'stripePriceId',
    'stripePriceIdYearly',
    'badge',
    'buttonText',
    'buttonStyle',
    'displayOrder',
    'availabilityStatus',
    'priceLabel',
    'trialDays',
    'features',
    'limits',
    'isActive',
    'isPublic',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy',
];

export const adminTenantStatusValues = Object.values(TenantStatus);

export const adminTenantStatusSchema = Joi.object({
    status: Joi.string().valid(...adminTenantStatusValues).required(),
    reason: Joi.string().allow('').optional().allow(null),
});

export const adminTenantQuerySchema = Joi.object({
    searchText: Joi.string().allow('').optional().allow(null),
    status: Joi.string().valid('All', ...adminTenantStatusValues).optional().allow(null),
    planType: Joi.string().allow('').optional().allow(null),
    continuationToken: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null),
    pageSize: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null),
});

export const adminUserQuerySchema = Joi.object({
    searchText: Joi.string().allow('').optional().allow(null),
    tenantId: Joi.string().allow('').optional().allow(null),
    status: Joi.string().allow('').optional().allow(null),
    continuationToken: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null),
    pageSize: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null),
});

export const adminPlanCreateSchema = Joi.object({
    planId: Joi.string().trim().required(),
    name: Joi.string().trim().required(),
    description: Joi.string().allow('').required(),
    monthlyPrice: Joi.number().min(0).required(),
    yearlyPrice: Joi.number().min(0).required(),
    currency: Joi.string().trim().required(),
    discountPercentage: Joi.number().min(0).max(100).required(),
    stripePriceId: Joi.string().allow('').optional().allow(null),
    stripePriceIdYearly: Joi.string().allow('').optional().allow(null),
    badge: Joi.string().allow('').optional().allow(null),
    buttonText: Joi.string().trim().required(),
    buttonStyle: Joi.string().valid('primary', 'secondary').required(),
    displayOrder: Joi.number().integer().required(),
    availabilityStatus: Joi.string().valid('available', 'roadmap').optional(),
    priceLabel: Joi.string().allow('').optional().allow(null),
    trialDays: Joi.number().integer().min(0).required(),
    features: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        displayName: Joi.string().required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).required(),
        included: Joi.boolean().required(),
        displayOrder: Joi.number().integer().required(),
    })).required(),
    limits: Joi.object().unknown(true).required(),
    isActive: Joi.boolean().required(),
    isPublic: Joi.boolean().required(),
});

export const adminPlanUpdateSchema = Joi.object({
    name: Joi.string().trim().optional(),
    description: Joi.string().allow('').optional(),
    monthlyPrice: Joi.number().min(0).optional(),
    yearlyPrice: Joi.number().min(0).optional(),
    currency: Joi.string().trim().optional(),
    discountPercentage: Joi.number().min(0).max(100).optional(),
    stripePriceId: Joi.string().allow('').optional().allow(null),
    stripePriceIdYearly: Joi.string().allow('').optional().allow(null),
    badge: Joi.string().allow('').optional().allow(null),
    buttonText: Joi.string().trim().optional(),
    buttonStyle: Joi.string().valid('primary', 'secondary').optional(),
    displayOrder: Joi.number().integer().optional(),
    availabilityStatus: Joi.string().valid('available', 'roadmap').optional(),
    priceLabel: Joi.string().allow('').optional().allow(null),
    trialDays: Joi.number().integer().min(0).optional(),
    features: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        displayName: Joi.string().required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).required(),
        included: Joi.boolean().required(),
        displayOrder: Joi.number().integer().required(),
    })).optional(),
    limits: Joi.object().unknown(true).optional(),
    isActive: Joi.boolean().optional(),
    isPublic: Joi.boolean().optional(),
}).min(1);
