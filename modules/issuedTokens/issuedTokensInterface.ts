export interface IIssuedToken {
    _id?: string;
    userId: string;
    tenantId: string;
    tokenHash: string;
    isActive: boolean;
    expiresAt: string;
    createdAt: string;
}

export const IssuedTokenFillableFields = [
    { column: 'userId', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'tokenHash', columnDataType: 'string' },
    { column: 'isActive', columnDataType: 'boolean' },
    { column: 'expiresAt', columnDataType: 'string' },
    { column: 'createdAt', columnDataType: 'string' },
];
