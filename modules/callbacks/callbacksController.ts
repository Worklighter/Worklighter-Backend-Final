import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../../utils/utils';
// import GmailManager from '../../integration/gmailManager';

const routes = express.Router();

/**
 * Google OAuth callback handler
 * This endpoint receives the authorization code from Google OAuth flow
 */
routes.get('/google', async (req: Request, res: Response): Promise<void> => {
    try {
        const { code, state, error } = req.query;

        // Handle OAuth errors
        if (error) {
            Utils.apiResponse({
                res,
                code: HttpStatusCode.BadRequest,
                status: false,
                responseCode: '400',
                responseDescription: `OAuth error: ${error}`
            });
            return;
        }

        // Validate authorization code
        if (!code || typeof code !== 'string') {
            Utils.apiResponse({
                res,
                code: HttpStatusCode.BadRequest,
                status: false,
                responseCode: '400',
                responseDescription: 'Authorization code is required'
            });
            return;
        }

        // Exchange authorization code for access token
        // const tokens = await GmailManager.getInstance().getAccessToken(code);

        // Decode state if provided (contains tenantId, storeName, etc.)
        let stateData = null;
        if (state && typeof state === 'string') {
            try {
                stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            } catch (err) {
                console.error('Error decoding state:', err);
            }
        }

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'OAuth callback processed successfully',
            data: {
                // tokens,
                state: stateData
            }
        });
    } catch (error: any) {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.InternalServerError,
            status: false,
            responseCode: '500',
            responseDescription: error?.message || 'An error occurred while processing OAuth callback'
        });
    }
});

export default routes;

