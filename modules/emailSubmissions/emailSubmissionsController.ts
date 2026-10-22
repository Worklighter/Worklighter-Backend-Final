import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../../utils/utils';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import { PAGE, PER_PAGE } from '../../utils/constants';
import EmailSubmissionsService from './emailSubmissionsService';
import { emailSubmissionsValidator, updateSubmissionStatusParamsValidator, updateInvoiceStatusValidator, updateDailyLogStatusValidator, updateComplianceAlertStatusValidator } from './emailSubmissionsValidator';
import { IListEmailSubmissionsDTO, IUpdateInvoiceStatusDTO, IUpdateDailyLogStatusDTO, IUpdateComplianceAlertStatusDTO } from './emailSubmissionsInterface';

const routes = express.Router();




//* -------------------------------------------------------------------------- */
//*                      API TO LIST INBOUND EMAIL SUBMISSIONS                 */
//* -------------------------------------------------------------------------- */
routes.get('/', authMiddleware, requireActiveSubscription, validateRequestQueryViaMiddleware(emailSubmissionsValidator), async (req: Request, res: Response) => {
    const data: IListEmailSubmissionsDTO = {
        submissionStatus: req.validatedQuery.submissionStatus || null,
        reviewQueue: req.validatedQuery.reviewQueue,
        pageSize: req.validatedQuery.pageSize || PER_PAGE,
        continuationToken: req.validatedQuery.continuationToken || PAGE
    }
    const result = await EmailSubmissionsService.listEmails(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: result.searchResult.length ? 'Email submissions fetched successfully' : 'No email submissions found',
        data: result
    });
});





//* -------------------------------------------------------------------------- */
//*                         API TO UPDATE INVOICE                              */
//* -------------------------------------------------------------------------- */
routes.patch('/:emailSubmissionId/invoices', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(updateSubmissionStatusParamsValidator), validateRequestBodyViaMiddleware(updateInvoiceStatusValidator), async (req: Request, res: Response) => {
    const data: IUpdateInvoiceStatusDTO = {
        emailSubmissionId: req.validatedParams.emailSubmissionId,
        status: req.validatedBody.status,
        aiAnalysisReport: req.validatedBody.aiAnalysisReport
    };
    const result = await EmailSubmissionsService.updateInvoiceStatus(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: `Invoice updated successfully`,
        data: result
    });
});





//* -------------------------------------------------------------------------- */
//*                        API TO UPDATE DAILY LOG                             */
//* -------------------------------------------------------------------------- */
routes.patch('/:emailSubmissionId/daily-logs', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(updateSubmissionStatusParamsValidator), validateRequestBodyViaMiddleware(updateDailyLogStatusValidator), async (req: Request, res: Response) => {
    const data: IUpdateDailyLogStatusDTO = {
        emailSubmissionId: req.validatedParams.emailSubmissionId,
        status: req.validatedBody.status,
        attachmentOrder: req.validatedBody.attachmentOrder ?? 1,
        aiAnalysisReport: req.validatedBody.aiAnalysisReport
    };
    const result = await EmailSubmissionsService.updateDailyLogStatus(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: `Daily log updated successfully`,
        data: result
    });
});





//* -------------------------------------------------------------------------- */
//*                      API TO UPDATE COMPLIANCE ALERT                        */
//* -------------------------------------------------------------------------- */
routes.patch('/:emailSubmissionId/compliance-alerts', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(updateSubmissionStatusParamsValidator), validateRequestBodyViaMiddleware(updateComplianceAlertStatusValidator), async (req: Request, res: Response) => {
    const data: IUpdateComplianceAlertStatusDTO = {
        emailSubmissionId: req.validatedParams.emailSubmissionId,
        attachmentOrder: req.validatedBody.attachmentOrder ?? 1,
        aiAnalysisReport: req.validatedBody.aiAnalysisReport
    };
    const result = await EmailSubmissionsService.updateComplianceAlertStatus(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: `Compliance alert updated successfully`,
        data: result
    });
});




export default routes;
