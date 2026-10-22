interface IJWTPayload {
    id: string,
    username: string,
    email: string,
    role?: string,
    tenantId?: string,
    allowedStores?: string[],
    jwtType: string,
    userUtcOffset?: number | null,
    companyId?: string;
}


export default IJWTPayload;