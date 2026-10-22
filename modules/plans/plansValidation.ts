import Joi from 'joi';

/**
 * ╔═══════════════════════════════════════╗
 * ║    PLANS VALIDATION SCHEMAS           ║
 * ╚═══════════════════════════════════════╝
 */

/**
 * Validation for plan ID parameter
 */
export const planIdSchema = Joi.object({
    planId: Joi.string()
        .required()
        .messages({
            'any.required': 'Plan ID is required'
        })
});
