import Joi from 'joi';
import StatusTypes from '../../core/enums/statusTypes';
import UserRoles from '../../core/enums/userRoles';
import { idsValidator, continuationTokenValidator, pageSizeValidator } from '../../core/validators/generalValidators';
import PlanTypes from '../../core/enums/planTypes';
import { Country, State, City } from 'country-state-city';

// Valid expiration alert values
const validExpirationAlerts = [
    '30 days from expiration',
    '15 days from expiration',
    '7 days from expiration',
    'expired'
];


export const createUserValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    username: Joi.string().trim().required().label('Username'),
    role: Joi.string().valid(UserRoles.ADMIN, UserRoles.PROJECTMANAGER, UserRoles.SUPERADMIN, UserRoles.PLATFORMADMIN).required().label('Role')
});

export const listUsersValidator = Joi.object().keys({
    searchText: Joi.string().trim().optional().allow('').label('Search Text'),
    continuationToken: continuationTokenValidator,
    pageSize: pageSizeValidator,
    fields: Joi.string().trim().optional().allow('').label('Fields')
});

export const updateUserParamsValidator = Joi.object().keys({
    userId: idsValidator.required().label('User ID')
});

export const updateUserBodyValidator = Joi.object().keys({
    email: Joi.string().trim().email().optional().label('Email'),
    username: Joi.string().trim().optional().label('Username'),
    role: Joi.string().valid(UserRoles.ADMIN, UserRoles.PROJECTMANAGER, UserRoles.SUPERADMIN, UserRoles.PLATFORMADMIN).optional().label('Role'),
    accountStatus: Joi.string().valid(StatusTypes.ACTIVE, StatusTypes.DELETED).optional().label('Account Status')
});


export const updateProfileValidator = Joi.object({
    firstName: Joi.string().min(2).max(50).trim().optional().messages({
        'string.min': 'First name must be at least 2 characters long',
        'string.max': 'First name cannot exceed 50 characters',
        'string.empty': 'First name cannot be empty'
    }),
    lastName: Joi.string().min(2).max(50).trim().optional().messages({
        'string.min': 'Last name must be at least 2 characters long',
        'string.max': 'Last name cannot exceed 50 characters',
        'string.empty': 'Last name cannot be empty'
    })
}).min(1).messages({
    'object.min': 'At least one field (firstName or lastName) must be provided'
});


/*
 * ╔═══════════════════════════════════════╗
 * ║      ONBOARDING VALIDATORS            ║
 * ╚═══════════════════════════════════════╝
 */

/*
 * ╔═══════════════════════════════════════╗
 * ║      COMPANY INFO VALIDATORS          ║
 * ╚═══════════════════════════════════════╝
 */

export const updateCompanyInfoValidator = Joi.object().keys({
    companyName: Joi.string().trim().required().label('Company Name'),
    industry: Joi.string().trim().required().label('Industry'),
    companyAddress: Joi.string().trim().optional().allow(null).label('Company Address'),
    country: Joi.string().trim().required().label('Country'),
    city: Joi.string().trim().required().label('City'),
    state: Joi.string().trim().optional().allow(null).label('State'),
    zipCode: Joi.string().trim().required().label('ZIP Code'),
    timezone: Joi.string().trim().required().label('Timezone'),
    companyLogo: Joi.string().trim().optional().label('Company Logo')
}).custom((value, helpers) => {
    const countryIso = value?.country;
    const stateIso = value?.state;
    const cityName = value?.city;
    const timezone = value?.timezone;

    if (!countryIso) return value;

    const matchedCountry = Country.getCountryByCode(countryIso);
    if (!matchedCountry) {
        return helpers.error('any.invalid', { message: 'Invalid country code' });
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
        return helpers.error('any.invalid', { message: 'Invalid timezone' });
    }
    const countryTimezones = matchedCountry.timezones ?? [];
    if (countryTimezones.length > 0 && !countryTimezones.some(tz => tz.zoneName === timezone)) {
        return helpers.error('any.invalid', { message: 'Timezone does not match the selected country' });
    }

    const states = State.getStatesOfCountry(countryIso);
    if (states.length > 0) {
        if (!stateIso) {
            return helpers.error('any.invalid', { message: 'State is required for the given country' });
        }
        const matchedState = State.getStateByCodeAndCountry(stateIso, countryIso);
        if (!matchedState) {
            return helpers.error('any.invalid', { message: 'Invalid state for the given country' });
        }
        const cities = City.getCitiesOfState(countryIso, stateIso);
        const cityExists = cities.some(c => c.name === cityName);
        if (!cityExists) {
            return helpers.error('any.invalid', { message: 'Invalid city for the given state' });
        }
    } else {
        const cities = City.getCitiesOfCountry(countryIso);
        const cityExists = cities.some(c => c.name === cityName);
        if (!cityExists) {
            return helpers.error('any.invalid', { message: 'Invalid city for the given country' });
        }
    }

    return value;
}).messages({
    'any.required': '{#label} is required',
    'object.min': 'At least one field must be provided for update'
});


/*
 * ╔═══════════════════════════════════════╗
 * ║      TEAM MEMBER VALIDATORS           ║
 * ╚═══════════════════════════════════════╝
 */

export const inviteTeamMemberValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    name: Joi.string().trim().optional().allow('').label('Name'),
    role: Joi.string().trim().required().label('Role')
});

export const updateTeamMemberValidator = Joi.object().keys({
    email: Joi.string().trim().email().optional().label('Email'),
    name: Joi.string().trim().optional().allow('').label('Name'),
    role: Joi.string().trim().optional().label('Role')
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

export const teamMemberParamsValidator = Joi.object().keys({
    memberId: Joi.string().trim().required().label('Member ID')
});


export const onboardingValidator = Joi.object().keys({
    // Step is always required
    step: Joi.number().integer().min(1).max(6).required().label('Step'),

    //* Step 1: Company Info
    companyName: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('Company Name'),
    industry: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('Industry'),
    companyAddress: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('Company Address'),
    country: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('Country'),
    city: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('City'),
    state: Joi.string().trim().optional().allow(null).label('State'),
    zipCode: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('ZIP Code'),
    timezone: Joi.string().trim().when('step', {
        is: 1,
        then: Joi.required(),
        otherwise: Joi.optional()
    }).label('Timezone'),

    //* Step 2: Selected Workflows
    selectedWorkflows: Joi.string().when('step', {
        is: 2,
        then: Joi.required(),
        otherwise: Joi.forbidden()
    }).label('Selected Workflows'),

    // Step 3: Cost Codes & Workers Comp (files only - no body validation needed)

    // Step 4: Compliance Documents
    expirationAlerts: Joi.string().optional().custom((value, helpers) => {
        if (!value) return value;
        try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
                return helpers.error('any.invalid', { message: 'Expiration Alerts must be an array' });
            }
            for (const alert of parsed) {
                if (!validExpirationAlerts.includes(alert)) {
                    return helpers.error('any.invalid', { message: `Invalid expiration alert value: ${alert}. Allowed values are: ${validExpirationAlerts.join(', ')}` });
                }
            }
            return value;
        } catch (e) {
            return helpers.error('any.invalid', { message: 'Expiration Alerts must be a valid JSON array' });
        }
    }).label('Expiration Alerts'),

    // Step 5: Approval Limits
    pmApprovalLimit: Joi.string().optional().custom((value, helpers) => {
        if (!value) return value;
        const num = Number(value);
        if (isNaN(num) || !Number.isInteger(num) || num < 0) {
            return helpers.error('any.invalid', { message: 'PM Approval Limit must be a positive integer' });
        }
        return value;
    }).label('PM Approval Limit'),

    // Step 6: Team Members
    teamMembers: Joi.string().optional().label('Team Members')

    // Step 6: Confirmation (no additional fields)
}).custom((value, helpers) => {
    if (value?.step !== 1) {
        return value;
    }

    const countryIso = value?.country;
    const stateIso = value?.state;
    const cityName = value?.city;
    const timezone = value?.timezone;

    const matchedCountry = Country.getCountryByCode(countryIso);
    if (!matchedCountry) {
        return helpers.error('any.invalid', { message: 'Invalid country code' });
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
        return helpers.error('any.invalid', { message: 'Invalid timezone' });
    }
    const countryTimezones = matchedCountry.timezones ?? [];
    if (countryTimezones.length > 0 && !countryTimezones.some(tz => tz.zoneName === timezone)) {
        return helpers.error('any.invalid', { message: 'Timezone does not match the selected country' });
    }

    const states = State.getStatesOfCountry(countryIso);
    if (states.length > 0) {
        if (!stateIso) {
            return helpers.error('any.invalid', { message: 'State is required for the given country' });
        }
        const matchedState = State.getStateByCodeAndCountry(stateIso, countryIso);
        if (!matchedState) {
            return helpers.error('any.invalid', { message: 'Invalid state for the given country' });
        }
        const cities = City.getCitiesOfState(countryIso, stateIso);
        const cityExists = cities.some(c => c.name === cityName);
        if (!cityExists) {
            return helpers.error('any.invalid', { message: 'Invalid city for the given state' });
        }
    } else {
        const cities = City.getCitiesOfCountry(countryIso);
        const cityExists = cities.some(c => c.name === cityName);
        if (!cityExists) {
            return helpers.error('any.invalid', { message: 'Invalid city for the given country' });
        }
    }

    return value;
});

/*
 * ╔═══════════════════════════════════════╗
 * ║   APPROVAL LIMIT VALIDATOR (NEW)      ║
 * ╚═══════════════════════════════════════╝
 */

export const updateApprovalLimitValidator = Joi.object({
    pmApprovalLimit: Joi.number()
        .integer()
        .min(0)
        .required()
        .messages({
            'number.base': 'PM Approval Limit must be a number',
            'number.integer': 'PM Approval Limit must be an integer',
            'number.min': 'PM Approval Limit cannot be negative',
            'any.required': 'PM Approval Limit is required'
        })
});

// Admin Onboarding Dashboard Validator
export const getCompanyDashboardValidator = Joi.object().keys({
    companyName: Joi.string().trim().optional().allow('').label('Search Text'),
    companyStatus: Joi.string().valid(StatusTypes.ACTIVE, StatusTypes.PENDING, StatusTypes.INACTIVE).optional().label('Status'),
    pageSize: pageSizeValidator,
    continuationToken: continuationTokenValidator,
    planType: Joi.string().trim().valid(...Object.values(PlanTypes)).label('Plan Type').optional().allow('')
});


export const updateCompanyDashboardValidator = Joi.object().keys({
    companyStatus: Joi.string().valid(StatusTypes.ACTIVE, StatusTypes.PENDING, StatusTypes.INACTIVE).optional().label('Company Status'),
});


