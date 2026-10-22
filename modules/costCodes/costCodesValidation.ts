import Joi from 'joi';

/**
 * ╔═══════════════════════════════════════╗
 * ║    COST CODES VALIDATION SCHEMAS      ║
 * ╚═══════════════════════════════════════╝
 */

/**
 * Validation for creating a new cost code
 */
export const createCostCodeSchema = Joi.object({
    codeNumber: Joi.string()
        .trim()
        .max(50)
        .required()
        .messages({
            'string.max': 'Code number must not exceed 50 characters',
            'any.required': 'Code number is required'
        }),
    
    category: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.min': 'Category must be at least 2 characters',
            'string.max': 'Category must not exceed 100 characters',
            'any.required': 'Category is required'
        }),
    
    description: Joi.string()
        .min(2)
        .max(500)
        .required()
        .messages({
            'string.min': 'Description must be at least 2 characters',
            'string.max': 'Description must not exceed 500 characters',
            'any.required': 'Description is required'
        })
});

/**
 * Validation for updating a cost code
 */
export const updateCostCodeSchema = Joi.object({
    codeNumber: Joi.string()
        .trim()
        .max(50)
        .optional()
        .messages({
            'string.max': 'Code number must not exceed 50 characters'
        }),
    
    category: Joi.string()
        .min(2)
        .max(100)
        .optional()
        .messages({
            'string.min': 'Category must be at least 2 characters',
            'string.max': 'Category must not exceed 100 characters'
        }),
    
    description: Joi.string()
        .min(2)
        .max(500)
        .optional()
        .messages({
            'string.min': 'Description must be at least 2 characters',
            'string.max': 'Description must not exceed 500 characters'
        })
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

/**
 * Validation for listing cost codes
 */
export const listCostCodesSchema = Joi.object({
    searchText: Joi.string()
        .optional()
        .allow('')
        .max(100),
    
    continuationToken: Joi.number()
        .integer()
        .min(1)
        .optional()
        .default(1),
    
    pageSize: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .default(15)
});

/**
 * Validation for cost code ID parameter
 */
export const costCodeIdSchema = Joi.object({
    id: Joi.string()
        .required()
        .messages({
            'any.required': 'Cost code ID is required'
        })
});
