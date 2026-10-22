import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import rateLimit from 'express-rate-limit';
import { validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { RateLimitConfig } from '../../configurations/ratelimiter';
import { Utils } from '../../utils/utils';
import EmailRateLimiter from '../../middlewares/emailRateLimiter';
import AuthService from './authService';
import TokenManager from '../../utils/helpers/tokenManager';
import {
    ILoginDTO,
    IForgotPasswordDTO,
    IResetPasswordDTO,
    ISignupDTO,
    IVerifyResetCodeDTO,
    IChangePasswordDTO,
    IVerifyEmailOtpDTO
} from './authInterface';
import {
    loginValidator,
    forgotPasswordValidator,
    resetPasswordValidator,
    signupValidator,
    verifyResetCodeValidator,
    changePasswordSchema,
    verifyEmailOtpValidator
} from './authValidator';

const routes = express.Router();


routes.post('/signup', validateRequestBodyViaMiddleware(signupValidator), async (req: Request, res: Response) => {
    const data: ISignupDTO = req.validatedBody;
    const result = await AuthService.signup(data);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'Account created successfully',
        data: result
    });
});


routes.post('/login', validateRequestBodyViaMiddleware(loginValidator), async (req: Request, res: Response) => {
    const data: ILoginDTO = req.validatedBody;
    const result = await AuthService.login(data);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'You have successfully logged in',
        data: result
    });
});



routes.post('/forgot-password',
    rateLimit(RateLimitConfig.getSensitiveRouteRateLimit()),
    validateRequestBodyViaMiddleware(forgotPasswordValidator),
    EmailRateLimiter.middleware(),
    async (req: Request, res: Response) => {
        const data: IForgotPasswordDTO = req.validatedBody;
        await AuthService.forgotPassword(data);
        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: "You will get an email with OTP to reset your password if an account exists with this email"
        });
    }
);


routes.post('/verify-otp', validateRequestBodyViaMiddleware(verifyResetCodeValidator), async (req: Request, res: Response) => {
    const data: IVerifyResetCodeDTO = req.validatedBody;
    const result = await AuthService.verifyResetCode(data.email, data.code);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Code verified successfully',
        data: result
    });
});


routes.post('/reset-password', validateRequestBodyViaMiddleware(resetPasswordValidator), async (req: Request, res: Response) => {
    const data: IResetPasswordDTO = req.validatedBody;
    await AuthService.resetPassword(data);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: "Password reset successfully"
    });
});


routes.post('/logout', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
        await TokenManager.revokeToken(token);
    }

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Logged out successfully'
    });
});


routes.patch('/change-password', authMiddleware, validateRequestBodyViaMiddleware(changePasswordSchema), async (req: Request, res: Response) => {
    const data: IChangePasswordDTO = req.validatedBody;
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
        return res.status(HttpStatusCode.Unauthorized).json({
            success: false,
            message: 'Unauthorized'
        });
    }

    await AuthService.changePassword(userId.toString(), data);

    return res.status(HttpStatusCode.Ok).json({
        success: true,
        message: 'Password changed successfully'
    });
}
);

routes.post(
    '/send-verification-email',
    authMiddleware,
    rateLimit(RateLimitConfig.getSensitiveRouteRateLimit()),
    EmailRateLimiter.middleware(),
    async (req: Request, res: Response) => {
        const userId = (req as any).user?.id || (req as any).user?._id;

        if (!userId) {
            return res.status(HttpStatusCode.Unauthorized).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        await AuthService.sendVerificationEmail(userId.toString());

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Verification OTP sent to your email'
        });
    }
);


routes.post(
    '/verify-email-otp',
    validateRequestBodyViaMiddleware(verifyEmailOtpValidator),
    async (req: Request, res: Response) => {
        const data: IVerifyEmailOtpDTO = req.validatedBody;

        await AuthService.verifyEmailOtp(data);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Email verified successfully'
        });
    }
);


export default routes;
