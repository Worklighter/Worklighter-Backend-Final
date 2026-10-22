import Joi from "joi";

const scheduleSchema = Joi.object({
    id: Joi.string().optional(),
    days: Joi.number().integer().min(1).max(365).required(),
    enabled: Joi.boolean().optional().default(true)
});

export const updateAlertConfigValidator = Joi.object({
    externalAlertMode: Joi.string().valid('manual', 'auto').optional(),
    externalSchedules: Joi.array().items(scheduleSchema).optional(),
    sendFinalAlertOnExpiration: Joi.boolean().optional(),
    internalAlertMode: Joi.string().valid('manual', 'auto').optional(),
    internalSchedules: Joi.array().items(scheduleSchema).optional(),
    internalCCRecipients: Joi.array().items(Joi.string().email()).optional(),
    sendFinalInternalAlert: Joi.boolean().optional()
});

export const addScheduleValidator = Joi.object({
    days: Joi.array().items(
        Joi.number().integer().min(1).max(365).messages({
            'number.base': 'Days must be a number',
            'number.min': 'Days must be at least 1',
            'number.max': 'Days cannot exceed 365'
        })
    ).min(1).required().messages({
        'array.base': 'Days must be an array of numbers',
        'array.min': 'Days must include at least one value',
        'any.required': 'Days is required'
    })
});

export const scheduleIdParamsValidator = Joi.object({
    scheduleId: Joi.string().required().messages({
        'string.empty': 'Schedule ID is required'
    })
});

export const addRecipientValidator = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
    })
});

export const recipientEmailParamsValidator = Joi.object({
    email: Joi.string().email().required().messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
    })
});
