import Joi from 'joi'
import { Utils } from '../../utils/utils';
import { PAGINATION_CONFIGURATION, REGEX } from '../../utils/constants';

export const locationValidator = Joi.object().keys({
    lat: Joi.number().optional().messages({
        'number.base': 'Latitude must be a number.'
    }).label('Latitude'),
    long: Joi.number().optional().messages({
        'number.base': 'Longitude must be a number.'
    }).label('Longitude'),
    address: Joi.string().trim().optional().label('Address')
});



export const reelAdditionalSettingsValidator = Joi.object().keys({
    commentsAllowed: Joi.boolean().optional().default(true).label('Comments Allowed')
});


export const dateValidator = Joi.string()
    .pattern(REGEX.DATE_IN_YEAR_MONTH_DAY_FORMAT_REGEX)
    .custom((value, helpers) => {
        const dateValue = new Date(value).toISOString().split('T')[0];
        const now = Utils.getCurrentDateFormatted(parseInt(helpers.prefs.context?.userUtcOffset) || 0);
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        const oneYearLater = oneYearFromNow.toISOString().split('T')[0];

        if (dateValue < now) {
            return helpers.error('date.greater');
        }
        if (dateValue > oneYearLater) {
            return helpers.error('year.greater');
        }
        return value;
    })
    .messages({
        'date.greater': '{{#label}} must be greater or equal to the current date',
        'year.greater': '{{#label}} must not be more than 1 year from now'
    });


export const flexibleDateValidator = Joi.string().trim().pattern(REGEX.DATE_IN_YEAR_MONTH_DAY_FORMAT_REGEX);


export const idsValidator = Joi.string().trim().pattern(REGEX.MONGODB_ID_REGEX).messages({
    'string.pattern.base': 'Invalid {{#label}} provided'
});


export const pageSizeValidator = Joi.number().integer().positive().min(PAGINATION_CONFIGURATION.DEFAULT_MIN_PAGE_SIZE).max(PAGINATION_CONFIGURATION.DEFAULT_MAX_PAGE_SIZE).optional().allow('').label('Page Size');


export const continuationTokenValidator = Joi.number().integer().positive().min(PAGINATION_CONFIGURATION.DEFAULT_CONTINUATION_TOKEN_MIN_VALUE).optional().allow('').label('Continuation Token');


export const reviewValidator = Joi.string().trim().label('Review');

export const imageValidator = Joi.string().trim().uri().optional().allow(null).label('Image')

export const globalSearchTextValidator = Joi.string().trim().label('Search Text');


export const rolePermissionValidator = Joi.object().keys({
    menuSlug: Joi.string().trim().required().label('Menu Slug'),
    permissions: Joi.array().items(Joi.string().trim()).min(1).required().label('Permissions')
});