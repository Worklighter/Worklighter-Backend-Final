export interface IOtp {
    _id?: string;
    userId: string;
    email: string;
    otp: string;
    purpose: string; // 'password_reset', 'email_verification', etc.
    expiresAt: string;
    isUsed: boolean;
    createdAt: string;
}

export const OtpFillableFields = [
    { column: 'userId', columnDataType: 'string' },
    { column: 'email', columnDataType: 'string' },
    { column: 'otp', columnDataType: 'string' },
    { column: 'purpose', columnDataType: 'string' },
    { column: 'expiresAt', columnDataType: 'string' },
    { column: 'isUsed', columnDataType: 'boolean' },
    { column: 'createdAt', columnDataType: 'string' }
];