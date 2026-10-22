import Joi from 'joi';
import BillingCycle from '../../core/enums/billingCycle';

export const initiateCheckoutSchema = Joi.object({
    planId: Joi.string().trim().required().messages({
        'any.required': 'Plan ID is required',
    }),
    billingCycle: Joi.string()
        .valid(...Object.values(BillingCycle))
        .default(BillingCycle.MONTHLY)
        .messages({
            'any.only': `Billing cycle must be one of: ${Object.values(BillingCycle).join(', ')}`,
        }),
});

export const confirmCheckoutSchema = Joi.object({
    setupIntentId: Joi.string().trim().required().messages({
        'any.required': 'Setup intent ID is required',
    }),
});

export const reactivateSubscriptionSchema = Joi.object({
    planId: Joi.string().trim().required().messages({
        'any.required': 'Plan ID is required',
    }),
    billingCycle: Joi.string()
        .valid(...Object.values(BillingCycle))
        .default(BillingCycle.MONTHLY)
        .messages({
            'any.only': `Billing cycle must be one of: ${Object.values(BillingCycle).join(', ')}`,
        }),
    paymentMethodId: Joi.string().trim().optional().allow(''),
});

export const cancelSubscriptionSchema = Joi.object({
    cancelImmediately: Joi.boolean().default(false),
});

export const changePlanSchema = Joi.object({
    planId: Joi.string().trim().required().messages({
        'any.required': 'Plan ID is required',
    }),
    billingCycle: Joi.string()
        .valid(...Object.values(BillingCycle))
        .default(BillingCycle.MONTHLY)
        .messages({
            'any.only': `Billing cycle must be one of: ${Object.values(BillingCycle).join(', ')}`,
        }),
    effectiveImmediately: Joi.boolean().default(false),
});
