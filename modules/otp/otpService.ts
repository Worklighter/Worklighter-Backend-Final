import { Utils } from "../../utils/utils";
import OtpModel from "./otpModel";
import OtpRepository from "./otpRepository";
import { IOtp } from "./otpInterface";
import QueryOperators from "../../core/enums/queryOperators";
import { CustomError } from "../../core/errors/custom";
import { HttpStatusCode } from "axios";
import { ObjectId } from "mongodb";

class OtpService {

    public generateOtp(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    public async createOtp(userId: string, email: string, purpose: string = 'password_reset'): Promise<string> {
        const cooldownSeconds = 60;
        const existing: IOtp | null = await OtpRepository.getInstance().GetOneByParams([
            { param: 'email', value: email, operator: QueryOperators.AND },
            { param: 'purpose', value: purpose, operator: QueryOperators.AND },
            { param: 'isUsed', value: false, operator: QueryOperators.AND }
        ]);

        if (existing) {
            const secondsSinceCreated = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
            if (secondsSinceCreated < cooldownSeconds) {
                const waitSeconds = Math.ceil(cooldownSeconds - secondsSinceCreated);
                throw new CustomError(HttpStatusCode.TooManyRequests, `Please wait ${waitSeconds} seconds before requesting a new code`);
            }
        }

        const otp = this.generateOtp();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const otpData: Partial<IOtp> = {
            userId,
            email,
            otp,
            purpose,
            expiresAt,
            isUsed: false,
            createdAt: Utils.getCurrentDate()
        };

        const otpModel = OtpModel.create(otpData);
        await OtpRepository.getInstance().Add(otpModel);

        return otp;
    }

    public async verifyOtp(email: string, otp: string, purpose: string = 'password_reset'): Promise<IOtp> {
        const conditions = [
            { param: 'email', value: email, operator: QueryOperators.AND },
            { param: 'otp', value: otp, operator: QueryOperators.AND },
            { param: 'purpose', value: purpose, operator: QueryOperators.AND },
            { param: 'isUsed', value: false, operator: QueryOperators.AND }
        ];

        const otpRecord: IOtp = await OtpRepository.getInstance().GetOneByParams(conditions);

        if (!otpRecord) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid or expired OTP');
        }

        // Check if OTP is expired
        const now = new Date();
        const expiryDate = new Date(otpRecord.expiresAt);
        
        if (now > expiryDate) {
            throw new CustomError(HttpStatusCode.BadRequest, 'OTP has expired');
        }

        return otpRecord;
    }

    public async markOtpAsUsed(otpId: string): Promise<void> {
        await OtpRepository.getInstance().Update(new ObjectId(otpId), { isUsed: true });
    }
}

export default new OtpService();