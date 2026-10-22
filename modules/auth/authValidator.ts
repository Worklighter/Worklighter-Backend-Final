import Joi from 'joi';
import { REGEX } from '../../utils/constants';

export const signupValidator = Joi.object().keys({
    firstName: Joi.string().trim().required().label('First Name'),
    lastName: Joi.string().trim().required().label('Last Name'),
    email: Joi.string().trim().email().required().label('Email'),
    password: Joi.string().trim().pattern(REGEX.PASSWORD_REGEX).required().label('Password').messages({
        'string.pattern.base': 'Password does not meet the required format'
    })
});

export const loginValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    password: Joi.string().trim().required().label('Password')
});


export const forgotPasswordValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email')
});

export const verifyResetCodeValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    code: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().label('Verification Code').messages({
        'string.length': 'Verification Code must be 6 digits',
        'string.pattern.base': 'Verification Code must be numeric'
    })
});

export const resetPasswordValidator = Joi.object().keys({
    resetPasswordToken: Joi.string().trim().required().label('Reset Password Token'),
    newPassword: Joi.string().trim().pattern(REGEX.PASSWORD_REGEX).required().label('Password'),
});

export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'string.empty': 'Current Password is required',
        'any.required': 'Current Password is required'
    }),
    newPassword: Joi.string()
        .min(8)
        .pattern(/[A-Z]/) 
        .pattern(/[0-9]/) 
        .required()
        .messages({
            'string.empty': 'New Password is required',
            'any.required': 'New Password is required',
            'string.min': 'New Password must be at least 8 characters long',
            'string.pattern.base': 'New Password must contain at least one uppercase letter and one number'
        }),
    confirmNewPassword: Joi.string()
        .valid(Joi.ref('newPassword'))
        .required()
        .messages({
            'string.empty': 'Confirm New Password is required',
            'any.required': 'Confirm New Password is required',
            'any.only': 'Passwords do not match'
        })
});

export const verifyEmailOtpValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    otp: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().label('OTP').messages({
        'string.length': 'OTP must be 6 digits',
        'string.pattern.base': 'OTP must be numeric'
    })
});

export const verifyOtpValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    otp: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().label('OTP').messages({
        'string.pattern.base': 'OTP must be numeric'
    })
});

export const resetPasswordWithOtpValidator = Joi.object().keys({
    email: Joi.string().trim().email().required().label('Email'),
    otp: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().label('OTP').messages({
        'string.pattern.base': 'OTP must be numeric'
    }),
    password: Joi.string().trim().pattern(REGEX.PASSWORD_REGEX).required().label('Password').messages({
        'string.pattern.base': 'Password does not meet the required format'
    }),
    confirmPassword: Joi.string().trim().valid(Joi.ref('password')).required().label('Confirm Password').messages({
        'any.only': 'Passwords do not match'
    }),
    currentPassword: Joi.string().trim().required().label('Current Password').messages({
        'any.required': 'Current Password is required',
        'string.empty': 'Current Password is required',
        'any.empty': 'Current Password is required',
        'string.min': 'Current Password is required'
    })
});