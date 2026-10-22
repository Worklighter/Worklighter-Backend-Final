import FillableField from "../../core/interfaces/fillableFields";
import { GeneralFillables } from "../../core/interfaces/generalInterface";

/**
 * ╔═══════════════════════════════════════╗
 * ║         PLANS INTERFACES              ║
 * ╚═══════════════════════════════════════╝
 */

export interface IPlan {
    _id: string;
    planId: string; // 'coi_control', 'ops_control', 'compliance_stack'
    name: string;
    description: string;
    
    // Pricing
    monthlyPrice: number;
    yearlyPrice: number;
    currency: string;
    discountPercentage: number; // 20% for yearly
    
    // Stripe
    stripePriceId?: string;       // Stripe Price ID for monthly billing
    stripePriceIdYearly?: string; // Stripe Price ID for yearly billing

    // Display
    badge?: string; // 'Most Popular'
    buttonText: string; // 'Get Started' or 'Contact Sales'
    buttonStyle: 'primary' | 'secondary';
    displayOrder: number;
    availabilityStatus?: 'available' | 'roadmap';
    priceLabel?: string;
    
    // Trial
    trialDays: number;
    
    // Features & Limits
    features: IPlanFeature[];
    limits: IPlanLimits;
    
    // Status
    isActive: boolean;
    isPublic: boolean;
    
    // Metadata
    createdAt: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    deletedAt?: string;
}

export interface IPlanFeature {
    name: string;
    displayName: string;
    value: number | string | boolean;
    included: boolean;
    displayOrder: number;
}

export interface IPlanLimits {
    workflows: number | 'unlimited';
    activeJobs: number | 'unlimited';
    documentsPerMonth: number | 'unlimited';
    apiAccess: boolean;
    customWorkflows: boolean;
    prioritySupport: 'none' | 'email' | 'phone' | '24/7';
    storageGB: number | 'unlimited';
    teamMembers: number | 'unlimited';
}

/**
 * Fillable fields for plans
 */
export const PlanFillableFields: FillableField[] = [
    { column: 'planId', columnDataType: 'string' },
    { column: 'stripePriceId', columnDataType: 'string' },
    { column: 'stripePriceIdYearly', columnDataType: 'string' },
    { column: 'name', columnDataType: 'string' },
    { column: 'description', columnDataType: 'string' },
    { column: 'monthlyPrice', columnDataType: 'number' },
    { column: 'yearlyPrice', columnDataType: 'number' },
    { column: 'currency', columnDataType: 'string' },
    { column: 'discountPercentage', columnDataType: 'number' },
    { column: 'badge', columnDataType: 'string' },
    { column: 'buttonText', columnDataType: 'string' },
    { column: 'buttonStyle', columnDataType: 'string' },
    { column: 'displayOrder', columnDataType: 'number' },
    { column: 'availabilityStatus', columnDataType: 'string' },
    { column: 'priceLabel', columnDataType: 'string' },
    { column: 'trialDays', columnDataType: 'number' },
    { column: 'features', columnDataType: 'array' },
    { column: 'limits', columnDataType: 'object' },
    { column: 'isActive', columnDataType: 'boolean' },
    { column: 'isPublic', columnDataType: 'boolean' },
    ...GeneralFillables
];

/**
 * Response fields for optimized queries
 */
export const optimizedPlanResponseFields = [
    '_id',
    'planId',
    'name',
    'description',
    'monthlyPrice',
    'yearlyPrice',
    'currency',
    'discountPercentage',
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
    'updatedAt'
];
