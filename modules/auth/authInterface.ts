import { IUsers } from "../users/usersInterface";


export interface ISignupDTO {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
}

export interface ILoginDTO {
    email: string;
    password: string;
}

export interface IVerifyEmailOtpDTO {
    email: string;
    otp: string;
}

export interface IForgotPasswordDTO {
    email: string;
}

export interface IVerifyResetCodeDTO {
    email: string;
    code: string;
}

export interface IResetPasswordDTO {
    resetPasswordToken: string;
    newPassword: string;
}

export interface IResetPasswordWithOtpDTO {
    email: string;
    otp: string;
    password: string;
    confirmPassword: string;
}

export interface IChangePasswordDTO {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
}

export interface ILoginResponse {
    accessToken: string;
    user: Partial<IUsers>;
}

export interface ISignupResponse {
    accessToken: string;
    user: Partial<IUsers>;
}

export interface ISocialLoginResponse {
    accessToken: string;
    user: Partial<IUsers>;
}