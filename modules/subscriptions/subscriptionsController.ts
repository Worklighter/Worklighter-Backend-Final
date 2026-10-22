import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../../utils/utils';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireTenantAdmin from '../../middlewares/requireTenantAdmin';
import { validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';
import SubscriptionsService from './subscriptionsService';
import TransactionHistoryService from '../transactionHistory/transactionHistoryService';
import {
    initiateCheckoutSchema,
    confirmCheckoutSchema,
    cancelSubscriptionSchema,
    changePlanSchema,
    reactivateSubscriptionSchema,
} from './subscriptionsValidator';
import StripeService from '../../integration/stripe';
import StripeConfig from '../../configurations/stripe';
import { Logger } from '../../utils/helpers/logger';

const router = express.Router();
const service = SubscriptionsService.getInstance();

//* -------------------------------------------------------------------------- */
//*                   API TO GET ACTIVE SUBSCRIPTION                           */
//* -------------------------------------------------------------------------- */
router.get('/active', authMiddleware, async (req: Request, res: Response) => {
    const subscription = await service.getActiveSubscription(req.user.tenantId);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Active subscription fetched successfully',
        data: subscription,
    });
});

//* -------------------------------------------------------------------------- */
//*                   API TO GET BILLING SUMMARY FOR RESUBSCRIBE               */
//* -------------------------------------------------------------------------- */
router.get('/billing-summary', authMiddleware, async (req: Request, res: Response) => {
    const summary = await service.getBillingSummary(req.user.tenantId);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Billing summary fetched successfully',
        data: summary,
    });
});

//* -------------------------------------------------------------------------- */
//*          API TO INITIATE CHECKOUT — RETURNS SETUP INTENT CLIENT SECRET     */
//* -------------------------------------------------------------------------- */
router.post('/checkout/setup-intent', authMiddleware, validateRequestBodyViaMiddleware(initiateCheckoutSchema), async (req: Request, res: Response) => {
    const result = await service.initiateCheckout(req.user, req.validatedBody);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Setup intent created. Use clientSecret to complete payment.',
        data: result,
    });
});

//* -------------------------------------------------------------------------- */
//*        API TO CONFIRM CHECKOUT — ACTIVATES SUBSCRIPTION AFTER PAYMENT      */
//* -------------------------------------------------------------------------- */
router.post('/checkout/confirm', authMiddleware, validateRequestBodyViaMiddleware(confirmCheckoutSchema), async (req: Request, res: Response) => {
    const result = await service.confirmCheckout(req.user, req.validatedBody);
    Utils.apiResponse({
        res,
        code: result.requiresAction ? HttpStatusCode.Accepted : HttpStatusCode.Created,
        status: true,
        responseCode: result.requiresAction ? '202' : '201',
        responseDescription: result.requiresAction
            ? 'Additional authentication required'
            : 'Subscription activated successfully',
        data: result,
    });
});

//* -------------------------------------------------------------------------- */
//*                   API TO REACTIVATE USING SAVED CARD                       */
//* -------------------------------------------------------------------------- */
router.post('/reactivate', authMiddleware, requireTenantAdmin, validateRequestBodyViaMiddleware(reactivateSubscriptionSchema), async (req: Request, res: Response) => {
    const result = await service.reactivateSubscription(req.user, req.validatedBody);
    Utils.apiResponse({
        res,
        code: result.requiresAction ? HttpStatusCode.Accepted : HttpStatusCode.Created,
        status: true,
        responseCode: result.requiresAction ? '202' : '201',
        responseDescription: result.requiresAction
            ? 'Additional authentication required'
            : 'Subscription reactivated successfully',
        data: result,
    });
});

//* -------------------------------------------------------------------------- */
//*                        API TO CANCEL SUBSCRIPTION                          */
//* -------------------------------------------------------------------------- */
router.patch('/cancel', authMiddleware, requireTenantAdmin, validateRequestBodyViaMiddleware(cancelSubscriptionSchema), async (req: Request, res: Response) => {
    const { cancelImmediately } = req.validatedBody;
    const result = await service.cancelSubscription(req.user.tenantId, cancelImmediately);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: cancelImmediately
            ? 'Subscription cancelled immediately'
            : 'Subscription will be cancelled at the end of the billing period',
        data: result,
    });
});

//* -------------------------------------------------------------------------- */
//*                         API TO CHANGE PLAN                                 */
//* -------------------------------------------------------------------------- */
router.patch('/change-plan', authMiddleware, requireTenantAdmin, validateRequestBodyViaMiddleware(changePlanSchema), async (req: Request, res: Response) => {
    const result = await service.changePlan(req.user.tenantId, req.validatedBody);
    Utils.apiResponse({
        res,
        code: result.requiresAction ? HttpStatusCode.Accepted : HttpStatusCode.Ok,
        status: true,
        responseCode: result.requiresAction ? '202' : '200',
        responseDescription: result.requiresAction
            ? 'Additional authentication required to apply the plan change'
            : 'Subscription plan updated successfully',
        data: result,
    });
});

//* -------------------------------------------------------------------------- */
//*                     API TO GET TRANSACTION HISTORY                         */
//* -------------------------------------------------------------------------- */
router.get('/transactions', authMiddleware, async (req: Request, res: Response) => {
    const continuationToken = parseInt(req.query.continuationToken as string) || 0;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const { data, total } = await TransactionHistoryService.getInstance().listByTenant(req.user.tenantId, continuationToken, pageSize);
    const lastPage = continuationToken + pageSize >= total;
    const nextContinuationToken = lastPage ? null : String(continuationToken + pageSize);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Transaction history fetched successfully',
        data: Utils.pagination(lastPage, data, nextContinuationToken, total),
    });
});

//* -------------------------------------------------------------------------- */
//*                      API TO HANDLE STRIPE WEBHOOK                          */
//* -------------------------------------------------------------------------- */
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['stripe-signature'] as string;
        const rawBody = (req as any).rawBody || (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
        const webhookSecret = StripeConfig.GetStripeConf().webhookSecret;

        if (!webhookSecret) {
            Logger.Console('Stripe webhook secret not configured', 'error');
            res.status(HttpStatusCode.InternalServerError).json({ error: 'Webhook secret not configured' });
            return;
        }

        const stripe = StripeService.getInstance().getStripeInstance();
        const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

        await service.handleStripeWebhook(event);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Webhook processed successfully',
            data: null,
        });
    } catch (err: any) {
        Logger.Console(`Stripe webhook error: ${err.message}`, 'error');
        res.status(HttpStatusCode.BadRequest).json({ error: `Webhook error: ${err.message}` });
    }
});

export default router;
