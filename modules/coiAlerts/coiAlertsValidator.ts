import Joi from 'joi';

export const createVendorValidator = Joi.object({
    vendorName: Joi.string().required().min(2).max(200).messages({
        'string.min': 'Vendor name must be at least 2 characters',
        'string.max': 'Vendor name cannot exceed 200 characters',
        'any.required': 'Vendor name is required'
    }),
    vendorEmail: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Vendor email is required'
    }),
    coiExpirationDate: Joi.date().iso().required().messages({
        'date.format': 'COI expiration date must be a valid date',
        'any.required': 'COI expiration date is required'
    }),
    emailTemplate: Joi.string().required().min(2).max(100).messages({
        'string.min': 'Email template must be at least 2 characters',
        'string.max': 'Email template cannot exceed 100 characters',
        'any.required': 'Email template is required'
    }),
    emailSubject: Joi.string().required().min(5).max(200).messages({
        'string.min': 'Email subject must be at least 5 characters',
        'string.max': 'Email subject cannot exceed 200 characters',
        'any.required': 'Email subject is required'
    }),
    emailBody: Joi.string().required().min(10).max(5000).messages({
        'string.min': 'Email body must be at least 10 characters',
        'string.max': 'Email body cannot exceed 5000 characters',
        'any.required': 'Email body is required'
    }),
    ccRecipients: Joi.alternatives().try(
        Joi.array().items(
            Joi.string().email().messages({
                'string.email': 'Each CC recipient must be a valid email address'
            })
        ),
        Joi.string().custom((value, helpers) => {
            try {
                const parsed = JSON.parse(value);
                if (!Array.isArray(parsed)) {
                    return helpers.error('array.base');
                }
                return parsed;
            } catch (e) {
                return helpers.error('string.invalid');
            }
        })
    ).optional().default([]).messages({
        'array.base': 'CC recipients must be an array of email addresses',
        'string.invalid': 'CC recipients must be a valid JSON array'
    })
});

export const updateVendorValidator = Joi.object({
    vendorName: Joi.string().optional().min(2).max(200).messages({
        'string.min': 'Vendor name must be at least 2 characters',
        'string.max': 'Vendor name cannot exceed 200 characters'
    }),
    vendorEmail: Joi.string().email().optional().messages({
        'string.email': 'Please provide a valid email address'
    }),
    coiExpirationDate: Joi.date().iso().optional().allow(null, '').messages({
        'date.format': 'COI expiration date must be a valid date'
    }),
    emailTemplate: Joi.string().optional().min(2).max(100).messages({
        'string.min': 'Email template must be at least 2 characters',
        'string.max': 'Email template cannot exceed 100 characters'
    }),
    emailSubject: Joi.string().optional().min(5).max(200).messages({
        'string.min': 'Email subject must be at least 5 characters',
        'string.max': 'Email subject cannot exceed 200 characters'
    }),
    emailBody: Joi.string().optional().min(10).max(5000).messages({
        'string.min': 'Email body must be at least 10 characters',
        'string.max': 'Email body cannot exceed 5000 characters'
    }),
    ccRecipients: Joi.alternatives().try(
        Joi.array().items(
            Joi.string().email().messages({
                'string.email': 'Each CC recipient must be a valid email address'
            })
        ),
        Joi.string().custom((value, helpers) => {
            try {
                const parsed = JSON.parse(value);
                if (!Array.isArray(parsed)) {
                    return helpers.error('array.base');
                }
                return parsed;
            } catch (e) {
                return helpers.error('string.invalid');
            }
        })
    ).optional().messages({
        'array.base': 'CC recipients must be an array of email addresses',
        'string.invalid': 'CC recipients must be a valid JSON array'
    })
});

export const getVendorsValidator = Joi.object({
    searchText: Joi.string().optional().allow(''),
    continuationToken: Joi.number().optional(),
    pageSize: Joi.number().optional().min(1).max(100),
    status: Joi.string().valid('active', 'expiring_soon', 'expired').optional()
});

export const vendorIdParamsValidator = Joi.object({
    vendorId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
        'string.pattern.base': 'Invalid vendor ID format',
        'string.empty': 'Vendor ID is required'
    })
});

export const sendReminderParamsValidator = Joi.object({
    vendorId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
        'string.pattern.base': 'Invalid vendor ID format',
        'string.empty': 'Vendor ID is required'
    })
});

export const sendReminderBodyValidator = Joi.object({
    reminderType: Joi.string().valid('standard', 'urgent', 'friendly').optional().default('standard')
});
