import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { verifyMailgunSignature } from '../../middlewares/mailgunVerificationMiddleware';
import { mailgunWebhookUpload } from '../../middlewares/fileUploadMiddleware';
import WebhooksService from './webhooksService';
import { Logger } from '../../utils/helpers/logger';

const routes = express.Router();

//* -------------------------------------------------------------------------- */
//*                               MAILGUN WEBHOOK                              */
//* -------------------------------------------------------------------------- */
routes.post('/mailgun/inbound', mailgunWebhookUpload, verifyMailgunSignature, async (req: Request, res: Response): Promise<void> => {
    try {
        await WebhooksService.processInboundEmail(req.body, req.files as Express.Multer.File[]);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Email received and processed successfully'
        });

    } catch (error) {
        Logger.Log(`Error processing Mailgun webhook: ${error}`, 'error');
        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Webhook received (processing error logged)'
        });
    }
});

export default routes;