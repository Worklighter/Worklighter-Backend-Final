import { Request, Response, NextFunction } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../utils/utils';

class EmailRateLimiter {
    private emailAttempts = new Map<string, { count: number; first: number }>();
    private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    private readonly MAX_ATTEMPTS = 3;

    public middleware() {
        return (req: Request, res: Response, next: NextFunction) => {
            const email: string = req.validatedBody?.email?.toLowerCase();
            
            if (!email) return next();
            
            const now = Date.now();
            const record = this.emailAttempts.get(email);
            
            // Reset if outside window
            if (!record || now - record.first > this.WINDOW_MS) {
                this.emailAttempts.set(email, { count: 1, first: now });
                return next();
            }
            
            // Check if limit exceeded
            if (record.count >= this.MAX_ATTEMPTS) {
                return Utils.apiResponse({
                    res,
                    code: HttpStatusCode.TooManyRequests,
                    status: false,
                    responseCode: '429',
                    responseDescription: 'Too many OTP requests. Please wait 15 minutes and try again'
                });
            }
            
            // Increment count
            record.count += 1;
            this.emailAttempts.set(email, record);
            next();
        };
    }

    // Optional: Cleanup old entries periodically
    public startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [email, record] of this.emailAttempts.entries()) {
                if (now - record.first > this.WINDOW_MS) {
                    this.emailAttempts.delete(email);
                }
            }
        }, 60 * 1000); // Cleanup every minute
    }
}

export default new EmailRateLimiter();