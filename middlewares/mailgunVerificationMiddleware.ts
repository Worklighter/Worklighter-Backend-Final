import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { CustomError } from '../core/errors/custom';
import { HttpStatusCode } from 'axios';
import { Logger } from '../utils/helpers/logger';
import { Application } from '../app';


export const verifyMailgunSignature = (req: Request, res: Response, next: NextFunction) => {
    try {
        const { timestamp, token, signature } = req.body;

        if (!timestamp || !token || !signature) {
            Logger.Log('Missing Mailgun signature fields', 'warn');
            throw new CustomError(
                HttpStatusCode.Unauthorized,
                'Missing signature verification fields'
            );
        }

        const MAILGUN_SIGNING_KEY = Application.conf.SERVICES.MAILGUN.signingKey;

        if (!MAILGUN_SIGNING_KEY) {
            Logger.Log('MAILGUN_SIGNING_KEY not configured in environment', 'error');
            throw new CustomError(
                HttpStatusCode.InternalServerError,
                'Mailgun signing key not configured'
            );
        }

        const timestampDate = new Date(parseInt(timestamp) * 1000);
        const now = new Date();
        const timeDiff = Math.abs(now.getTime() - timestampDate.getTime()) / 1000 / 60;

        if (timeDiff > 15) {
            Logger.Log(`Mailgun signature timestamp too old: ${timeDiff} minutes`, 'warn');
            throw new CustomError(
                HttpStatusCode.Unauthorized,
                'Signature timestamp expired'
            );
        }

        const encodedToken = crypto
            .createHmac('sha256', MAILGUN_SIGNING_KEY)
            .update(timestamp.concat(token))
            .digest('hex');

        const isValid = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(encodedToken)
        );

        if (!isValid) {
            Logger.Log('Invalid Mailgun signature', 'warn');
            throw new CustomError(
                HttpStatusCode.Unauthorized,
                'Invalid webhook signature'
            );
        }

        Logger.Log('✅ Mailgun signature verified successfully', 'info');
        next();

    } catch (error) {
        if (error instanceof CustomError) {
            throw error;
        }
        Logger.Log(`Mailgun signature verification error: ${error}`, 'error');
        throw new CustomError(
            HttpStatusCode.Unauthorized,
            'Signature verification failed'
        );
    }
};