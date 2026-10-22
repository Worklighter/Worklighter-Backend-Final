import Stripe from 'stripe';
import { IStripeConfig } from '../configurations/stripe';
import { Logger } from '../utils/helpers/logger';
import { CustomError } from '../core/errors/custom';
import { HttpStatusCode } from 'axios';

class StripeService {
    private static instance: StripeService | null = null;
    // @ts-ignore
    private stripe: Stripe;

    private constructor() {}

    public static getInstance(): StripeService {
        if (!StripeService.instance) {
            StripeService.instance = new StripeService();
        }
        return StripeService.instance;
    }

    public getStripeInstance(): Stripe {
        return this.stripe;
    }

    public async init(config: IStripeConfig): Promise<void> {
        this.stripe = new Stripe(config.secretKey, {
            // @ts-ignore
            apiVersion: '2024-09-30.acacia',
        });
        Logger.Console('Connected to Stripe successfully', 'info');
    }

    //* -------------------------------------------------------------------------- */
    //*                           CREATE CUSTOMER                                  */
    //* -------------------------------------------------------------------------- */
    public async createCustomer(name: string, email?: string, metadata: Record<string, string> = {}) {
        const customer = await this.stripe.customers.create({ name, email, metadata });
        return customer;
    }

    //* -------------------------------------------------------------------------- */
    //*                        GET CUSTOMER DETAILS                                */
    //* -------------------------------------------------------------------------- */
    public async getCustomerDetails(customerId: string) {
        return await this.stripe.customers.retrieve(customerId);
    }

    //* -------------------------------------------------------------------------- */
    //*                         CREATE SETUP INTENT                                */
    //* -------------------------------------------------------------------------- */
    public async createSetupIntent(customerId: string, metadata: Record<string, string> = {}) {
        const setupIntent = await this.stripe.setupIntents.create({
            customer: customerId,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            usage: 'off_session',
            metadata,
        });
        return setupIntent;
    }

    //* -------------------------------------------------------------------------- */
    //*                        RETRIEVE SETUP INTENT                               */
    //* -------------------------------------------------------------------------- */
    public async retrieveSetupIntent(setupIntentId: string) {
        return await this.stripe.setupIntents.retrieve(setupIntentId);
    }

    //* -------------------------------------------------------------------------- */
    //*                      ATTACH PAYMENT METHOD                                 */
    //* -------------------------------------------------------------------------- */
    public async attachPaymentMethod(paymentMethodId: string, customerId: string) {
        return await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    //* -------------------------------------------------------------------------- */
    //*                   SET DEFAULT PAYMENT METHOD                               */
    //* -------------------------------------------------------------------------- */
    public async setUserDefaultPaymentMethod(paymentMethodId: string, customerId: string) {
        await this.stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });
    }

    //* -------------------------------------------------------------------------- */
    //*                   DETACH PAYMENT METHOD                                    */
    //* -------------------------------------------------------------------------- */
    public async detachPaymentMethod(paymentMethodId: string, customerId: string) {
        const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== customerId) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Payment method does not belong to this customer');
        }
        await this.stripe.paymentMethods.detach(paymentMethodId);
    }

    //* -------------------------------------------------------------------------- */
    //*                  GET PAYMENT METHOD BY ID                                  */
    //* -------------------------------------------------------------------------- */
    public async getPaymentMethodById(paymentMethodId: string) {
        return await this.stripe.paymentMethods.retrieve(paymentMethodId);
    }

    //* -------------------------------------------------------------------------- */
    //*             LIST PAYMENT METHODS FOR CUSTOMER                              */
    //* -------------------------------------------------------------------------- */
    public async listPaymentMethods(customerId: string) {
        return await this.stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    }

    //* -------------------------------------------------------------------------- */
    //*              CREATE SUBSCRIPTION WITH DEFAULT PM                           */
    //* -------------------------------------------------------------------------- */
    public async createSubscriptionWithDefaultPaymentMethod(
        customerId: string,
        stripePriceId: string,
        paymentMethodId: string,
    ) {
        await this.setUserDefaultPaymentMethod(paymentMethodId, customerId);
        const subscription = await this.stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: stripePriceId }],
            default_payment_method: paymentMethodId,
            collection_method: 'charge_automatically',
            expand: ['latest_invoice.payment_intent'],
        });
        return subscription;
    }

    //* -------------------------------------------------------------------------- */
    //*                       GET SUBSCRIPTION                                     */
    //* -------------------------------------------------------------------------- */
    public async getSubscription(subscriptionId: string) {
        return await this.stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice.payment_intent', 'schedule'],
        });
    }

    //* -------------------------------------------------------------------------- */
    //*                    UPDATE SUBSCRIPTION PRICE                              */
    //* -------------------------------------------------------------------------- */
    public async updateSubscriptionPrice(
        subscriptionId: string,
        subscriptionItemId: string,
        stripePriceId: string,
        metadata: Record<string, string> = {},
    ) {
        return await this.stripe.subscriptions.update(subscriptionId, {
            items: [{ id: subscriptionItemId, price: stripePriceId, quantity: 1 }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',
            metadata,
            expand: ['latest_invoice.payment_intent'],
        } as any);
    }

    //* -------------------------------------------------------------------------- */
    //*                    SUBSCRIPTION SCHEDULES                                 */
    //* -------------------------------------------------------------------------- */
    public async createSubscriptionSchedule(subscriptionId: string) {
        return await this.stripe.subscriptionSchedules.create({
            from_subscription: subscriptionId,
        });
    }

    public async getSubscriptionSchedule(scheduleId: string) {
        return await this.stripe.subscriptionSchedules.retrieve(scheduleId);
    }

    public async updateSubscriptionSchedule(scheduleId: string, params: Record<string, unknown>) {
        return await this.stripe.subscriptionSchedules.update(scheduleId, params as any);
    }

    public async releaseSubscriptionSchedule(scheduleId: string) {
        return await this.stripe.subscriptionSchedules.release(scheduleId);
    }

    //* -------------------------------------------------------------------------- */
    //*                      CANCEL SUBSCRIPTION                                   */
    //* -------------------------------------------------------------------------- */
    public async cancelSubscription(subscriptionId: string, cancelImmediately = false) {
        if (cancelImmediately) {
            return await this.stripe.subscriptions.cancel(subscriptionId, {
                invoice_now: false,
                prorate: false,
            } as any);
        }

        const subscription = await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
        });
        return subscription;
    }
}

export default StripeService;
