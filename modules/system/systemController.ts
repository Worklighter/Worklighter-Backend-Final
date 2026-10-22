import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { mailgunWebhookUpload } from '../../middlewares/fileUploadMiddleware';
import WebhooksService from '../webhooks/webhooksService';
import { Logger } from '../../utils/helpers/logger';


const routes = express.Router();

routes.get('/health', async (req: Request, res: Response): Promise<void> => {
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Server is up & running'
    });
});



//* -------------------------------------------------------------------------- */
//*                        TEST INBOUND EMAIL TRIGGER                          */
//* -------------------------------------------------------------------------- */
//* Dev-only endpoint that bypasses Mailgun signature verification.
//* Accepts the same multipart/form-data shape as the real Mailgun webhook so
//* the full processInboundEmail pipeline can be exercised locally.
//* Remove or gate behind NODE_ENV before deploying to production.
routes.post('/test/inbound-email', mailgunWebhookUpload, async (req: Request, res: Response): Promise<void> => {
    try {
        await WebhooksService.processInboundEmail(req.body, req.files as Express.Multer.File[]);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Test inbound email processed successfully',
        });
    } catch (error) {
        Logger.Log(`[TEST] Error processing test inbound email: ${error}`, 'error');
        Utils.apiResponse({
            res,
            code: HttpStatusCode.InternalServerError,
            status: false,
            responseCode: '500',
            responseDescription: `Processing failed: ${(error as Error)?.message ?? error}`,
        });
    }
});



export default routes;