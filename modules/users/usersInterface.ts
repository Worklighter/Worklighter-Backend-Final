import FillableField from "../../core/interfaces/fillableFields"
import { GeneralFillables } from "../../core/interfaces/generalInterface"
import { ICompany } from "../company/companyInterface"

export interface IUsers {
    _id: string,
    email: string,
    firstName: string,
    lastName: string,
    fullName: string,
    role: string,
    tenantId: string,
    username: string,
    password: string,
    isActive: boolean,
    isEmailVerified: boolean,
    emailVerifiedAt: Date | string | null,
    accountStatus: string,
    profilePicImage?: string | null,
    createdAt: string,
    createdBy?: string | null,
    updatedAt?: string | null,
    updatedBy?: string | null,
    deletedAt?: string | null,
}

export interface ISignupDTO {
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    confirmPassword: string
}

export const UserFillableFields: FillableField[] = [
    { column: 'email', columnDataType: 'string' },
    { column: 'firstName', columnDataType: 'string' },
    { column: 'lastName', columnDataType: 'string' },
    { column: 'role', columnDataType: 'string' },
    { column: 'profilePicImage', columnDataType: 'string' },
    { column: 'tenantId', columnDataType: 'string' },
    { column: 'username', columnDataType: 'string' },
    { column: 'password', columnDataType: 'string' },
    { column: 'isActive', columnDataType: 'boolean' },
    { column: 'isEmailVerified', columnDataType: 'boolean' },
    { column: 'emailVerifiedAt', columnDataType: 'date' },
    { column: 'accountStatus', columnDataType: 'string' },
    ...GeneralFillables
]


export interface ILoginDTO {
    email: string,
    password: string
}

export interface ICreateUserDTO {
    email: string,
    username: string,
    role: string,
    allowedStores: string[]
}

export interface ISocialLoginDTO {
    authToken: string
}

export interface IForgotPasswordDTO {
    email: string
}

export interface IVerifyResetCodeDTO {
    email: string;
    code: string;
}

export interface IResetPasswordDTO {
    resetToken: string;
    password: string;
}

export interface IUpdateProfileDTO {
    firstName?: string;
    lastName?: string;
    profilePicImage?: string;
}


export interface IListUsersDTO {
    searchText?: string,
    continuationToken?: number,
    pageSize?: number,
    fields?: string
}

export interface IUpdateUserDTO {
    userId: string,
    email?: string,
    username?: string,
    role?: string,
    accountStatus?: string,
    allowedStores?: string[]
}

export const listUsersResponseFields = [
    '_id',
    'email',
    'role',
    'username',
    'profilePicImage',
    'isActive',
    'accountStatus',
    'createdAt'
]

export const optimizedUserResponseFields = [
    '_id',
    'email',
    'firstName',
    'lastName',
    'role',
    'tenantId',
    'username',
    'profilePicImage',
    'isActive',
    'accountStatus',
    'createdAt'
]

export const profileResponseFields = [
    '_id',
    'firstName',
    'lastName',
    'email',
    'username',
    'tenantId',
    'role',
    'accountStatus',
    'profilePicImage',
    'createdAt',
    'isEmailVerified'
]





/*
 * ╔═══════════════════════════════════════╗
 * ║      TEAM MEMBER INTERFACES           ║
 * ╚═══════════════════════════════════════╝
 */

export interface ITeamMemberResponse {
    id: string;
    email: string;
    name: string;
    role: string;
    status: 'Active' | 'Inactive';
    invitedAt?: string;
    joinedAt?: string;
}

export interface IInviteTeamMemberDTO {
    email: string;
    name?: string;
    role: string;
}

export interface IUpdateTeamMemberDTO {
    email?: string;
    name?: string;
    role?: string;
}

export interface ITeamMemberParamsDTO {
    memberId: string;
}






