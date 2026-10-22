import Joi from 'joi';
import states from '../../core/enums/states';
import cities from '../../core/enums/cities';
import StatusTypes from '../../core/enums/statusTypes';
import { idsValidator, continuationTokenValidator, pageSizeValidator } from '../../core/validators/generalValidators';

const stateValues = Object.values(states);
const cityValues = Object.values(cities);

const uniqueEmailArray = (label: string) =>
    Joi.array()
        .items(Joi.string().email().messages({ 'string.email': `${label} must contain valid email addresses` }))
        .custom((value: string[]) => {
            const seen = new Set<string>();
            for (const email of value) {
                const normalized = email.toLowerCase();
                if (seen.has(normalized)) {
                    throw new Error(`${label} must not contain duplicate emails`);
                }
                seen.add(normalized);
            }
            return value;
        })
        .label(label);

export const createJobValidator = Joi.object({
    jobName: Joi.string().trim().min(2).max(100).required().label('Job Name'),
    jobNumber: Joi.string().trim().optional().allow(null, '').label('Job Number'),
    status: Joi.string().valid(StatusTypes.JOB_ACTIVE, StatusTypes.JOB_INACTIVE).optional().default(StatusTypes.JOB_ACTIVE).label('Status'),
    jobAddress: Joi.string().trim().max(200).optional().allow(null, '').label('Job Address'),
    city: Joi.string().valid(...cityValues).optional().allow(null, '').label('City'),
    state: Joi.string().valid(...stateValues).optional().allow(null, '').label('State'),
    zipCode: Joi.string().trim().pattern(/^\d{5}$/).optional().allow(null, '').label('Zip Code').messages({
        'string.pattern.base': 'Zip Code must be 5 digits'
    }),
    
    // Invoice Email Configuration
    invoiceRecipients: uniqueEmailArray('Invoice Recipients').optional().default([]),
    invoiceCcRecipients: uniqueEmailArray('Invoice CC Recipients').optional().default([]),
    includeInvoiceSubmitter: Joi.boolean().optional().default(true).label('Include Invoice Submitter'),

    // Daily Log Email Configuration
    dailyLogRecipients: uniqueEmailArray('Daily Log Recipients').optional().default([]),
    dailyLogCcRecipients: uniqueEmailArray('Daily Log CC Recipients').optional().default([]),
    includeDailyLogSubmitter: Joi.boolean().optional().default(true).label('Include Daily Log Submitter')
});

export const updateJobParamsValidator = Joi.object({
    jobId: idsValidator.required().label('Job ID')
});

export const updateJobBodyValidator = Joi.object({
    jobName: Joi.string().trim().min(2).max(100).optional().label('Job Name'),
    jobNumber: Joi.string().trim().optional().allow(null, '').label('Job Number'),
    status: Joi.string().valid(StatusTypes.JOB_ACTIVE, StatusTypes.JOB_INACTIVE).optional().label('Status'),
    jobAddress: Joi.string().trim().max(200).optional().allow(null, '').label('Job Address'),
    city: Joi.string().valid(...cityValues).optional().allow(null, '').label('City'),
    state: Joi.string().valid(...stateValues).optional().allow(null, '').label('State'),
    zipCode: Joi.string().trim().pattern(/^\d{5}$/).optional().allow(null, '').label('Zip Code').messages({
        'string.pattern.base': 'Zip Code must be 5 digits'
    }),
    
    // Invoice Email Configuration
    invoiceRecipients: uniqueEmailArray('Invoice Recipients').optional(),
    invoiceCcRecipients: uniqueEmailArray('Invoice CC Recipients').optional(),
    includeInvoiceSubmitter: Joi.boolean().optional().label('Include Invoice Submitter'),

    // Daily Log Email Configuration
    dailyLogRecipients: uniqueEmailArray('Daily Log Recipients').optional(),
    dailyLogCcRecipients: uniqueEmailArray('Daily Log CC Recipients').optional(),
    includeDailyLogSubmitter: Joi.boolean().optional().label('Include Daily Log Submitter')
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

export const listJobsValidator = Joi.object({
    searchText: Joi.string().trim().optional().allow('').label('Search Text'),
    status: Joi.string().valid('all', StatusTypes.JOB_ACTIVE, StatusTypes.JOB_INACTIVE).optional().default('all').label('Status'),
    continuationToken: continuationTokenValidator,
    pageSize: pageSizeValidator
});

export const getJobParamsValidator = Joi.object({
    jobId: idsValidator.required().label('Job ID')
});
