import { ObjectId } from 'mongodb';
import JwtTypes from "../../core/enums/jwtTypes";
import UserRoles from "../../core/enums/userRoles";
import TenantStatus from "../../core/enums/tenantStatus";
import StatusTypes from "../../core/enums/statusTypes";
import QueryOperators from "../../core/enums/queryOperators";
import { CustomError } from "../../core/errors/custom";
import { HttpStatusCode } from "axios";
import IJWTPayload from "../../core/interfaces/jwt";
import { Utils } from "../../utils/utils";
import SecurityManager from "../../utils/helpers/securityManager";
// import GmailManager from "../../integration/gmailManager";
import UsersService from "../users/usersService";
import UsersModel from "../users/usersModel";
import UsersRepository from "../users/usersRepository";
import OnboardingRepository from '../company/companyRepository';
import OtpService from "../otp/otpService";
import RolesService from "../roles/rolesService";
import {
    IUsers,
    optimizedUserResponseFields
} from "../users/usersInterface";
import { ICompany } from "../company/companyInterface";
import {
    ISignupDTO,
    // ISocialLoginDTO,
    ILoginDTO,
    IForgotPasswordDTO,
    IResetPasswordDTO,
    IChangePasswordDTO,
    ILoginResponse,
    ISignupResponse,
    IVerifyEmailOtpDTO
} from "./authInterface";
import EmailTemplateTypes from '../../core/enums/emailTemplateTypes';

class AuthService {

    public async changePassword(userId: string, data: IChangePasswordDTO): Promise<void> {
        const user = await UsersRepository.getInstance().GetById<IUsers>(
            userId,
            ['_id', 'email', 'password']
        );

        if (!user || !user.password) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        const isCurrentPasswordValid = await SecurityManager.verifyPassword(
            data.currentPassword,
            user.password
        );

        if (!isCurrentPasswordValid) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Current password is incorrect');
        }

        const isSameAsOldPassword = await SecurityManager.verifyPassword(
            data.newPassword,
            user.password
        );

        if (isSameAsOldPassword) {
            throw new CustomError(
                HttpStatusCode.BadRequest,
                'New password cannot be the same as your current password'
            );
        }

        const passwordHash = await SecurityManager.hashPassword(data.newPassword);

        await UsersService.updateUserPassword(userId, passwordHash);

        await UsersRepository.getInstance().Update(
            new ObjectId(userId),
            {
                passwordChangedAt: new Date(),
                updatedAt: new Date()
            },
            []
        );
    }

    public async signup(data: ISignupDTO): Promise<ISignupResponse> {
        const existingUser = await UsersService.getUserByEmail(data.email);
        if (existingUser) {
            throw new CustomError(HttpStatusCode.Conflict, 'A user already exists with this email');
        }

        const passwordHash = await SecurityManager.hashPassword(data.password);
        const username = data.email.split('@')[0];
        const tenantId = Utils.UUIDGenerator();

        const newUserData: Partial<IUsers> = {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email.toLowerCase(),
            username: username,
            password: passwordHash,
            tenantId: tenantId,
            role: UserRoles.ADMIN,
            accountStatus: StatusTypes.ACTIVE,
            isActive: true,
            isEmailVerified: false,
            emailVerifiedAt: null,
            createdAt: Utils.getCurrentDate(),
            createdBy: null
        };

        const newUser = UsersModel.create(newUserData);
        const createdUser: IUsers = await UsersRepository.getInstance().Add(newUser, optimizedUserResponseFields);

		const emptyOnboarding: Partial<ICompany> = {
            ownerId: createdUser._id.toString(),
            tenantId: createdUser.tenantId,
            tenantStatus: TenantStatus.TRIAL,
            step: null,
            companyName: null,
            industry: null,
            companyAddress: null,
            city: null,
            state: null,
            zipCode: null,
            timezone: null,
            companyCode: null,
            assignedEmail: null,
            companyLogo: null,
            selectedWorkflows: null,
            costCodesFiles: null,
            workersCompFiles: null,
            expirationAlerts: null,
            pmApprovalLimit: null,
            isPaymentCompleted: null,
            isCompleted: null,
            completedAt: null,
            createdAt: null,
            updatedAt: null,
            lastActivity: null,
            extractedDocumentData: null
        };

        await OnboardingRepository.getInstance().Add(emptyOnboarding);

        const { password, ...userDetails } = createdUser;

        const { accessToken, user } = await UsersService.issueJwt(userDetails, JwtTypes.API);
        const companyInfo = await OnboardingRepository.getInstance().GetOneByParam({
            param: 'tenantId',
            value: userDetails.tenantId,
        });

        return {
            accessToken,
            user: { ...user, companyInfo } as Partial<IUsers>
        };
    }

    // public async socialLogin(data: ISocialLoginDTO) {
    //     const userDetails = await GmailManager.getInstance().getUserInfo(data.authToken);
    //     const user: Partial<IUsers> = await UsersService.validateUserAccount(userDetails.email);
    //     const { accessToken } = await UsersService.issueJwt(user, JwtTypes.API);

    //     return {
    //         accessToken,
    //         user
    //     };
    // }

    public async login(data: ILoginDTO) {
        const user: Partial<IUsers> = await UsersService.validateUserAccount(data.email, [], true);
        const { password, ...userDetails } = user;

        await UsersService.validatePassword(data.password, password);

        const companySearchParam = {
            param: 'tenantId',
            value: userDetails.tenantId,
        }

        const companyInfo = await OnboardingRepository.getInstance().GetOneByParam<ICompany | null>(companySearchParam);

        if (companyInfo?.tenantStatus === TenantStatus.SUSPENDED) {
            throw new CustomError(HttpStatusCode.Forbidden, 'This tenant account is suspended');
        }

        const { accessToken, user: authUser } = await UsersService.issueJwt(userDetails, JwtTypes.API);

        const permissions: Record<string, any> = await RolesService.getPermissionsByRoleName(userDetails.role);

        return {
            ...authUser,
            ...permissions,
            companyInfo: companyInfo,
            accessToken
        };
    }

    public async forgotPassword(data: IForgotPasswordDTO): Promise<boolean> {
        const user: Partial<IUsers> | null = await UsersService.validateUserAccount(
            data.email,
            optimizedUserResponseFields,
            false
        );

        if (!user) {
            return;
        }

        const otp = await OtpService.createOtp(user._id.toString(), user.email, 'password_reset');

        await Utils.sendMail(
            user.email,
            EmailTemplateTypes.FORGOT_PASSWORD,
            {
                firstName: user.firstName || user.username,
                otp,
            },
            'Password Reset Request'
        );

        return;
    }

    public async verifyResetCode(email: string, code: string) {
        const otpRecord = await OtpService.verifyOtp(email.toLowerCase(), code, 'password_reset');

        await OtpService.markOtpAsUsed(otpRecord._id);

        const user: any = await UsersRepository.getInstance().GetOneByParams(
            [{ param: 'email', value: email.toLowerCase(), operator: QueryOperators.AND }],
            ['_id', 'email', 'tenantId']
        );

        if (!user) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid or expired code');
        }

        const payload = {
            id: user._id.toString(),
            email: user.email,
            tenantId: user.tenantId,
            jwtType: JwtTypes.PASSWORD_RESET
        };
        const resetPasswordToken = await SecurityManager.generateJWT(payload, JwtTypes.PASSWORD_RESET);

        return { resetPasswordToken };
    }

    public async resetPassword(data: IResetPasswordDTO) {
        const decodedToken: IJWTPayload | null = SecurityManager.verifyAndDecodeJwt(
            data.resetPasswordToken,
            JwtTypes.PASSWORD_RESET
        );

        if (!decodedToken) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid or expired reset token');
        }

        const user = await UsersService.validateUserAccount(decodedToken.email) as IUsers;

        if (!user) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        const passwordHash = await SecurityManager.hashPassword(data.newPassword);

        await UsersService.updateUserPassword(decodedToken.id, passwordHash);

        await UsersRepository.getInstance().Update(
            new ObjectId(decodedToken.id),
            {
                passwordResetCode: null,
                passwordResetCodeExpiresAt: null,
                passwordResetCodeVerified: true
            },
            []
        );
    }

    /**
     * Send Email Verification OTP
     */
    public async sendVerificationEmail(userId: string): Promise<void> {
        const user = await UsersRepository.getInstance().GetById<IUsers>(
            userId,
            ['_id', 'email', 'firstName', 'isEmailVerified']
        );

        if (!user) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        if (user.isEmailVerified) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Email already verified');
        }

        // Generate and store OTP
        const otp = await OtpService.createOtp(user._id.toString(), user.email, 'email_verification');

        // Send OTP via email template
        await Utils.sendMail(
            user.email,
            EmailTemplateTypes.EMAIL_VERIFICATION,
            {
                firstName: user.firstName,
                otp: otp
            },
            'Verify your email address'
        );
    }

    /**
     * Verify Email with OTP
     */
    public async verifyEmailOtp(data: IVerifyEmailOtpDTO): Promise<void> {
        // Verify OTP using OtpService
        const otpRecord = await OtpService.verifyOtp(data.email, data.otp, 'email_verification');

        // Get user
        const user = await UsersRepository.getInstance().GetOneByParams(
            [
                { param: 'email', value: data.email.toLowerCase(), operator: QueryOperators.AND }
            ],
            ['_id', 'isEmailVerified']
        ) as IUsers;

        if (!user) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        if (user.isEmailVerified) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Email already verified');
        }

        // Mark OTP as used
        await OtpService.markOtpAsUsed(otpRecord._id);

        // Mark email as verified
        await UsersRepository.getInstance().Update(
            new ObjectId(user._id),
            {
                isEmailVerified: true,
                emailVerifiedAt: new Date(),
                updatedAt: new Date()
            },
            []
        );
    }
}

export default new AuthService();
