import Joi from 'joi';

/**
 * ╔═══════════════════════════════════════╗
 * ║     WC CODES VALIDATION SCHEMAS       ║
 * ╚═══════════════════════════════════════╝
 */

/**
 * Validation schema for creating WC code
 */
export const createWCCodeSchema = Joi.object({
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
        .trim()
        .required()
        .messages({
            'string.min': 'Category must be at least 2 characters',
            'string.max': 'Category cannot exceed 100 characters',
            'any.required': 'Category is required'
        }),
    description: Joi.string()
        .min(3)
        .max(500)
        .trim()
        .required()
        .messages({
            'string.min': 'Description must be at least 3 characters',
            'string.max': 'Description cannot exceed 500 characters',
            'any.required': 'Description is required'
        })
});

/**
 * Validation schema for updating WC code
 */
export const updateWCCodeSchema = Joi.object({
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
        .trim()
        .optional()
        .messages({
            'string.min': 'Category must be at least 2 characters',
            'string.max': 'Category cannot exceed 100 characters'
        }),
    description: Joi.string()
        .min(3)
        .max(500)
        .trim()
        .optional()
        .messages({
            'string.min': 'Description must be at least 3 characters',
            'string.max': 'Description cannot exceed 500 characters'
        })
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

/**
 * Validation schema for listing WC codes
 */
export const listWCCodesSchema = Joi.object({
    searchText: Joi.string()
        .allow('', null)
        .optional()
        .trim(),
    continuationToken: Joi.number()
        .integer()
        .min(1)
        .default(1)
        .optional(),
    pageSize: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(15)
        .optional()
});

/**
 * Validation schema for WC code ID parameter
 */
export const wcCodeIdSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid WC code ID format',
            'any.required': 'WC code ID is required'
        })
});
