import { HttpStatusCode } from 'axios';
import { ObjectId } from 'mongodb';
import SubscriptionsRepository from './subscriptionsRepository';
import SubscriptionsModel from './subscriptionsModel';
import {
    ISubscription,
    IInitiateCheckoutDTO,
    IConfirmCheckoutDTO,
    IChangePlanDTO,
    IBillingSummary,
    IReactivateSubscriptionDTO,
    IPendingSubscriptionChange,
    ISavedPaymentMethodSummary,
    subscriptionResponseFields,
} from './subscriptionsInterface';
import { CustomError } from '../../core/errors/custom';
import { Utils } from '../../utils/utils';
import QueryOperators from '../../core/enums/queryOperators';
import SubscriptionStatus from '../../core/enums/subscriptionStatus';
import BillingCycle from '../../core/enums/billingCycle';
import PaymentStatus from '../../core/enums/paymentStatus';
import TransactionPurpose from '../../core/enums/transactionPurpose';
import StripeService from '../../integration/stripe';
import TransactionHistoryService from '../transactionHistory/transactionHistoryService';
import { PlansRepository } from '../plans/plansRepository';
import IJWTPayload from '../../core/interfaces/jwt';
import CompanyService from '../company/companyService';
import OnboardingRepository from '../company/companyRepository';
import TenantStatus from '../../core/enums/tenantStatus';
import { ICompany } from '../company/companyInterface';

class SubscriptionsService {
    private static instance: SubscriptionsService;
    private repository: SubscriptionsRepository;

    private constructor() {
        this.repository = SubscriptionsRepository.getInstance();
    }

    public static getInstance(): SubscriptionsService {
        if (!SubscriptionsService.instance) {
            SubscriptionsService.instance = new SubscriptionsService();
        }
        return SubscriptionsService.instance;
    }

    //* -------------------------------------------------------------------------- */
    //*                         GET ACTIVE SUBSCRIPTION                            */
    //* -------------------------------------------------------------------------- */
    public async getActiveSubscription(tenantId: string): Promise<ISubscription | null> {
        return await this.repository.GetOneByParams(
            [
                { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
                { param: 'isActive', value: true, operator: QueryOperators.AND },
            ],
            subscriptionResponseFields,
        ) as ISubscription | null;
    }

    private async getLatestSubscription(tenantId: string): Promise<ISubscription | null> {
        return await this.repository.collection
            .find({ tenantId })
            .sort({ createdAt: -1 })
            .limit(1)
            .next() as unknown as ISubscription | null;
    }

    private async getPlanAndStripePrice(planId: string, billingCycle: BillingCycle): Promise<{ plan: any; stripePriceId: string }> {
        const plan = await PlansRepository.getInstance().GetOneByParams(
            [{ param: 'planId', value: planId, operator: QueryOperators.AND }],
            ['_id', 'planId', 'name', 'monthlyPrice', 'yearlyPrice', 'stripePriceId', 'stripePriceIdYearly', 'isActive'],
        ) as any;

        if (!plan) throw new CustomError(HttpStatusCode.NotFound, 'Plan not found');
        if (!plan.isActive) throw new CustomError(HttpStatusCode.BadRequest, 'Plan is not currently available');

        const stripePriceId = billingCycle === BillingCycle.YEARLY
            ? (plan.stripePriceIdYearly || plan.stripePriceId)
            : plan.stripePriceId;

        if (!stripePriceId) throw new CustomError(HttpStatusCode.BadRequest, 'Stripe price is not configured for this plan. Please contact support.');

        return { plan, stripePriceId };
    }

    public async getBillingSummary(tenantId: string): Promise<IBillingSummary> {
        const activeSubscription = await this.getActiveSubscription(tenantId);
        const latestSubscription = activeSubscription || await this.getLatestSubscription(tenantId);
        const stripeCustomerId = latestSubscription?.stripeCustomerId || null;
        const paymentMethods: ISavedPaymentMethodSummary[] = [];
        let defaultPaymentMethodId: string | null = null;

        if (stripeCustomerId) {
            try {
                const stripe = StripeService.getInstance();
                const customer = await stripe.getCustomerDetails(stripeCustomerId) as any;
                defaultPaymentMethodId = typeof customer?.invoice_settings?.default_payment_method === 'string'
                    ? customer.invoice_settings.default_payment_method
                    : customer?.invoice_settings?.default_payment_method?.id || null;

                const methods = await stripe.listPaymentMethods(stripeCustomerId);
                const cards = Array.isArray(methods?.data) ? methods.data : [];
                cards.forEach((method: any) => {
                    paymentMethods.push({
                        id: method.id,
                        brand: method.card?.brand || undefined,
                        last4: method.card?.last4 || undefined,
                        expMonth: method.card?.exp_month || undefined,
                        expYear: method.card?.exp_year || undefined,
                        isDefault: method.id === defaultPaymentMethodId,
                    });
                });
            } catch (error) {
                console.error('Failed to load billing summary payment methods:', error);
            }
        }

        paymentMethods.sort((left, right) => Number(right.isDefault) - Number(left.isDefault));

        return {
            activeSubscription,
            latestSubscription,
            stripeCustomerId,
            defaultPaymentMethodId,
            paymentMethods,
        };
    }

    //* -------------------------------------------------------------------------- */
    //*                  INITIATE CHECKOUT (returns SetupIntent)                   */
    //* -------------------------------------------------------------------------- */
    public async initiateCheckout(loggedInUser: IJWTPayload, dto: IInitiateCheckoutDTO) {
        const { tenantId, id: ownerId, email } = loggedInUser;
        const { planId, billingCycle } = dto;
        const { plan } = await this.getPlanAndStripePrice(planId, billingCycle);

        // Get or create Stripe customer
        const existingSub = await this.getActiveSubscription(tenantId) || await this.getLatestSubscription(tenantId);
        let stripeCustomerId: string = existingSub?.stripeCustomerId || '';

        if (!stripeCustomerId) {
            const customer = await StripeService.getInstance().createCustomer(
                loggedInUser.username || email,
                email,
                { tenantId, ownerId },
            );
            stripeCustomerId = customer.id;
        }

        const setupIntent = await StripeService.getInstance().createSetupIntent(stripeCustomerId, {
            tenantId,
            planId,
            billingCycle,
        });

        return {
            clientSecret: setupIntent.client_secret!,
            customerId: stripeCustomerId,
            planId,
            billingCycle,
            plan: {
                name: plan.name,
                price: billingCycle === BillingCycle.YEARLY ? plan.yearlyPrice : plan.monthlyPrice,
            },
        };
    }

    //* -------------------------------------------------------------------------- */
    //*                CONFIRM CHECKOUT (activates subscription)                   */
    //* -------------------------------------------------------------------------- */
    public async confirmCheckout(loggedInUser: IJWTPayload, dto: IConfirmCheckoutDTO) {
        const { tenantId, id: ownerId } = loggedInUser;
        const { setupIntentId } = dto;

        const setupIntent = await StripeService.getInstance().retrieveSetupIntent(setupIntentId);

        if (setupIntent.status !== 'succeeded') {
            throw new CustomError(HttpStatusCode.BadRequest, `Payment setup not completed — status: ${setupIntent.status}`);
        }

        const { planId, billingCycle, tenantId: siTenantId } = setupIntent.metadata ?? {};

        if (!planId) throw new CustomError(HttpStatusCode.BadRequest, 'Plan ID missing from payment setup. Please try again.');
        if (siTenantId && siTenantId !== tenantId) throw new CustomError(HttpStatusCode.Forbidden, 'Payment setup does not belong to this account');

        const resolvedBillingCycle = (billingCycle as BillingCycle) || BillingCycle.MONTHLY;
        const { plan, stripePriceId } = await this.getPlanAndStripePrice(planId, resolvedBillingCycle);

        const paymentMethodId = typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;

        if (!paymentMethodId) throw new CustomError(HttpStatusCode.BadRequest, 'No payment method found');

        const stripeCustomerId = typeof setupIntent.customer === 'string'
            ? setupIntent.customer
            : (setupIntent.customer as any)?.id;

        if (!stripeCustomerId) throw new CustomError(HttpStatusCode.BadRequest, 'No Stripe customer found');

        // Retrieve card details for storage
        const paymentMethod = await StripeService.getInstance().getStripeInstance().paymentMethods.retrieve(paymentMethodId);
        const cardLast4 = paymentMethod.card?.last4 ?? undefined;
        const cardBrand = paymentMethod.card?.brand ?? undefined;

        // Supersede old active subscription
        const currentSub = await this.getActiveSubscription(tenantId);
        const latestSub = currentSub || await this.getLatestSubscription(tenantId);
        if (currentSub) {
            throw new CustomError(HttpStatusCode.Conflict, 'An active subscription already exists. Use the change-plan action instead.');
        }

        // Create Stripe subscription
        const stripeSub = await StripeService.getInstance().createSubscriptionWithDefaultPaymentMethod(
            stripeCustomerId,
            stripePriceId,
            paymentMethodId,
        );

        const latestInvoice = stripeSub.latest_invoice as any;
        const paymentIntent = latestInvoice?.payment_intent as any;
        const requiresAction = paymentIntent?.status === 'requires_action';

        // Save subscription record
        const now = Utils.getCurrentDate();
        const newSub = SubscriptionsModel.create({
            tenantId,
            ownerId,
            stripeCustomerId,
            stripeSubscriptionId: stripeSub.id,
            planId,
            planName: plan.name,
            billingCycle: resolvedBillingCycle,
            status: this.mapStripeStatus(stripeSub.status),
            isActive: true,
            currentPeriodStart: (stripeSub as any).current_period_start
                ? new Date(((stripeSub as any).current_period_start as number) * 1000)
                : new Date(),
            currentPeriodEnd: (stripeSub as any).current_period_end
                ? new Date(((stripeSub as any).current_period_end as number) * 1000)
                : new Date(),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
            metadata: {
                cardLast4,
                cardBrand,
                ...(currentSub && {
                    previousPlanId: currentSub.planId,
                    previousPlanName: currentSub.planName,
                    previousBillingCycle: currentSub.billingCycle,
                }),
            },
            createdAt: now,
            updatedAt: now,
        });

        const savedSub = await this.repository.Add(newSub, subscriptionResponseFields) as ISubscription;

        // Record transaction if payment succeeded immediately
        if (!requiresAction && paymentIntent?.id) {
            const purpose = latestSub?.supersededAt || latestSub?.status === SubscriptionStatus.CANCELED
                ? TransactionPurpose.REACTIVATION
                : TransactionPurpose.INITIAL_SUBSCRIPTION;
            const periodStart = (stripeSub as any).current_period_start
                ? new Date(((stripeSub as any).current_period_start as number) * 1000).toISOString()
                : new Date().toISOString();
            const periodEnd = (stripeSub as any).current_period_end
                ? new Date(((stripeSub as any).current_period_end as number) * 1000).toISOString()
                : new Date().toISOString();

            const existingTransaction = await TransactionHistoryService.getInstance().findByStripePaymentIntentId(paymentIntent.id);
            if (!existingTransaction) {
                await TransactionHistoryService.getInstance().create({
                    tenantId,
                    subscriptionId: (savedSub as any)._id?.toString(),
                    stripePaymentIntentId: paymentIntent.id,
                    stripeInvoiceId: latestInvoice?.id,
                    amount: (latestInvoice?.amount_paid ?? 0) / 100,
                    currency: latestInvoice?.currency || 'usd',
                    status: PaymentStatus.SUCCEEDED,
                    purpose,
                    metadata: {
                        purpose,
                        planId,
                        planName: plan.name,
                        billingCycle: resolvedBillingCycle,
                        periodStart,
                        periodEnd,
                        cardLast4,
                        cardBrand,
                        ...(latestSub && {
                            previousPlanId: latestSub.planId,
                            previousPlanName: latestSub.planName,
                            previousBillingCycle: latestSub.billingCycle,
                        }),
                    },
                    paidAt: new Date(),
                });
            }
        }

        // Mark onboarding as fully completed now that payment is confirmed
        if (!requiresAction) {
            const company = await CompanyService.getOnboardingByOwnerId(ownerId);
            if (company) {
                await OnboardingRepository.getInstance().Update(
                    new ObjectId(company._id),
                    {
                        isPaymentCompleted: true,
                        isCompleted: true,
                        completedAt: Utils.getCurrentDate(),
                        tenantStatus: TenantStatus.ACTIVE,
                        updatedAt: Utils.getCurrentDate(),
                    },
                );
            }
        }

        return {
            requiresAction,
            ...(requiresAction ? { clientSecret: paymentIntent?.client_secret } : {}),
            subscription: savedSub,
        };
    }

    //* -------------------------------------------------------------------------- */
    //*                 REACTIVATE SUBSCRIPTION USING SAVED CARD                  */
    //* -------------------------------------------------------------------------- */
    public async reactivateSubscription(loggedInUser: IJWTPayload, dto: IReactivateSubscriptionDTO): Promise<{
        requiresAction: boolean;
        clientSecret?: string;
        subscription: ISubscription;
    }> {
        const { tenantId, id: ownerId } = loggedInUser;
        const currentSub = await this.getActiveSubscription(tenantId);
        if (currentSub) {
            throw new CustomError(HttpStatusCode.Conflict, 'An active subscription already exists.');
        }

        const latestSub = await this.getLatestSubscription(tenantId);
        if (!latestSub?.stripeCustomerId) {
            throw new CustomError(HttpStatusCode.NotFound, 'No saved payment customer was found for this account');
        }

        const resolvedBillingCycle = dto.billingCycle || BillingCycle.MONTHLY;
        const { plan, stripePriceId } = await this.getPlanAndStripePrice(dto.planId, resolvedBillingCycle);
        const stripe = StripeService.getInstance();

        let paymentMethodId = dto.paymentMethodId?.trim() || '';
        if (paymentMethodId) {
            const paymentMethod = await stripe.getPaymentMethodById(paymentMethodId);
            const paymentMethodCustomerId = typeof paymentMethod.customer === 'string'
                ? paymentMethod.customer
                : (paymentMethod.customer as any)?.id || null;

            if (paymentMethodCustomerId && paymentMethodCustomerId !== latestSub.stripeCustomerId) {
                throw new CustomError(HttpStatusCode.BadRequest, 'Selected payment method does not belong to this customer');
            }

            if (!paymentMethodCustomerId) {
                await stripe.attachPaymentMethod(paymentMethodId, latestSub.stripeCustomerId);
            }
        } else {
            const customer = await stripe.getCustomerDetails(latestSub.stripeCustomerId) as any;
            paymentMethodId = typeof customer?.invoice_settings?.default_payment_method === 'string'
                ? customer.invoice_settings.default_payment_method
                : customer?.invoice_settings?.default_payment_method?.id || '';
        }

        if (!paymentMethodId) {
            throw new CustomError(HttpStatusCode.BadRequest, 'No saved card is available for reactivation');
        }

        await stripe.setUserDefaultPaymentMethod(paymentMethodId, latestSub.stripeCustomerId);

        const paymentMethod = await stripe.getPaymentMethodById(paymentMethodId);
        const stripeSub = await stripe.createSubscriptionWithDefaultPaymentMethod(
            latestSub.stripeCustomerId,
            stripePriceId,
            paymentMethodId,
        );

        const latestInvoice = stripeSub.latest_invoice as any;
        const paymentIntent = latestInvoice?.payment_intent as any;
        const requiresAction = paymentIntent?.status === 'requires_action';
        const cardLast4 = paymentMethod.card?.last4 ?? undefined;
        const cardBrand = paymentMethod.card?.brand ?? undefined;

        const now = Utils.getCurrentDate();
        const newSub = SubscriptionsModel.create({
            tenantId,
            ownerId,
            stripeCustomerId: latestSub.stripeCustomerId,
            stripeSubscriptionId: stripeSub.id,
            planId: plan.planId,
            planName: plan.name,
            billingCycle: resolvedBillingCycle,
            status: this.mapStripeStatus(stripeSub.status),
            isActive: true,
            currentPeriodStart: (stripeSub as any).current_period_start
                ? new Date(((stripeSub as any).current_period_start as number) * 1000)
                : new Date(),
            currentPeriodEnd: (stripeSub as any).current_period_end
                ? new Date(((stripeSub as any).current_period_end as number) * 1000)
                : new Date(),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
            metadata: {
                cardLast4,
                cardBrand,
                previousPlanId: latestSub.planId,
                previousPlanName: latestSub.planName,
                previousBillingCycle: latestSub.billingCycle,
            },
            createdAt: now,
            updatedAt: now,
        });

        const savedSub = await this.repository.Add(newSub, subscriptionResponseFields) as ISubscription;

        if (!requiresAction && paymentIntent?.id) {
            const periodStart = (stripeSub as any).current_period_start
                ? new Date(((stripeSub as any).current_period_start as number) * 1000).toISOString()
                : new Date().toISOString();
            const periodEnd = (stripeSub as any).current_period_end
                ? new Date(((stripeSub as any).current_period_end as number) * 1000).toISOString()
                : new Date().toISOString();
            const existingTransaction = await TransactionHistoryService.getInstance().findByStripePaymentIntentId(paymentIntent.id);
            if (!existingTransaction) {
                await TransactionHistoryService.getInstance().create({
                    tenantId,
                    subscriptionId: (savedSub as any)._id?.toString(),
                    stripePaymentIntentId: paymentIntent.id,
                    stripeInvoiceId: latestInvoice?.id,
                    amount: (latestInvoice?.amount_paid ?? 0) / 100,
                    currency: latestInvoice?.currency || 'usd',
                    status: PaymentStatus.SUCCEEDED,
                    purpose: TransactionPurpose.REACTIVATION,
                    metadata: {
                        purpose: TransactionPurpose.REACTIVATION,
                        planId: plan.planId,
                        planName: plan.name,
                        billingCycle: resolvedBillingCycle,
                        periodStart,
                        periodEnd,
                        cardLast4,
                        cardBrand,
                        previousPlanId: latestSub.planId,
                        previousPlanName: latestSub.planName,
                        previousBillingCycle: latestSub.billingCycle,
                    },
                    paidAt: new Date(),
                });
            }
        }

        if (!requiresAction) {
            const company = await CompanyService.getOnboardingByOwnerId(ownerId);
            if (company) {
                await OnboardingRepository.getInstance().Update(
                    new ObjectId(company._id),
                    {
                        isPaymentCompleted: true,
                        isCompleted: true,
                        completedAt: Utils.getCurrentDate(),
                        tenantStatus: TenantStatus.ACTIVE,
                        updatedAt: Utils.getCurrentDate(),
                    },
                );
            }
        }

        return {
            requiresAction,
            ...(requiresAction ? { clientSecret: paymentIntent?.client_secret } : {}),
            subscription: savedSub,
        };
    }

    //* -------------------------------------------------------------------------- */
    //*                          CANCEL SUBSCRIPTION                               */
    //* -------------------------------------------------------------------------- */
    public async cancelSubscription(tenantId: string, cancelImmediately = false): Promise<ISubscription> {
        const sub = await this.getActiveSubscription(tenantId);
        if (!sub) throw new CustomError(HttpStatusCode.NotFound, 'No active subscription found');

        await this.releaseScheduleIfPresent(sub);

        if (sub.stripeSubscriptionId) {
            await StripeService.getInstance().cancelSubscription(sub.stripeSubscriptionId, cancelImmediately);
        }

        const updated = await this.repository.Update(new ObjectId(sub._id), {
            cancelAtPeriodEnd: !cancelImmediately,
            pendingChange: null,
            stripeScheduleId: null,
            ...(cancelImmediately ? { isActive: false, status: SubscriptionStatus.CANCELED, supersededAt: new Date() } : {}),
            updatedAt: Utils.getCurrentDate(),
        });

        if (cancelImmediately) {
            await this.markTenantUnpaid(sub.tenantId);
        }

        return updated as ISubscription;
    }

    //* -------------------------------------------------------------------------- */
    //*                         CHANGE SUBSCRIPTION PLAN                          */
    //* -------------------------------------------------------------------------- */
    public async changePlan(tenantId: string, dto: IChangePlanDTO): Promise<{
        requiresAction: boolean;
        clientSecret?: string;
        subscription: ISubscription | null;
    }> {
        const currentSub = await this.getActiveSubscription(tenantId);
        if (!currentSub) throw new CustomError(HttpStatusCode.NotFound, 'No active subscription found');
        if (!currentSub.stripeSubscriptionId) throw new CustomError(HttpStatusCode.BadRequest, 'Subscription is not connected to Stripe');

        const plan = await PlansRepository.getInstance().GetOneByParams(
            [{ param: 'planId', value: dto.planId, operator: QueryOperators.AND }],
            ['_id', 'planId', 'name', 'monthlyPrice', 'yearlyPrice', 'stripePriceId', 'stripePriceIdYearly', 'isActive', 'availabilityStatus'],
        ) as any;

        if (!plan) throw new CustomError(HttpStatusCode.NotFound, 'Plan not found');
        if (!plan.isActive || plan.availabilityStatus !== 'available') {
            throw new CustomError(HttpStatusCode.BadRequest, 'Plan is not currently available');
        }

        const targetPriceId = dto.billingCycle === BillingCycle.YEARLY
            ? (plan.stripePriceIdYearly || plan.stripePriceId)
            : plan.stripePriceId;
        if (!targetPriceId) throw new CustomError(HttpStatusCode.BadRequest, 'Stripe price is not configured for this plan');

        if (currentSub.planId === plan.planId && currentSub.billingCycle === dto.billingCycle && !currentSub.pendingChange) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Subscription is already on this plan and billing cycle');
        }

        const stripe = StripeService.getInstance();
        const stripeSub = await stripe.getSubscription(currentSub.stripeSubscriptionId) as any;
        const currentItem = stripeSub.items?.data?.[0];
        if (!currentItem?.id) throw new CustomError(HttpStatusCode.BadRequest, 'Stripe subscription has no billable item');

        const pendingChange: IPendingSubscriptionChange = {
            planId: plan.planId,
            planName: plan.name,
            billingCycle: dto.billingCycle,
            effectiveAt: dto.effectiveImmediately
                ? new Date()
                : new Date((stripeSub.current_period_end as number) * 1000),
            requestedAt: new Date(),
            previousPlanId: currentSub.planId,
            previousPlanName: currentSub.planName,
            previousBillingCycle: currentSub.billingCycle,
        };

        if (dto.effectiveImmediately) {
            await this.releaseScheduleIfPresent(currentSub, stripeSub);

            if (currentSub.cancelAtPeriodEnd) {
                await stripe.getStripeInstance().subscriptions.update(currentSub.stripeSubscriptionId, {
                    cancel_at_period_end: false,
                });
            }

            const updatedStripeSub = await stripe.updateSubscriptionPrice(
                currentSub.stripeSubscriptionId,
                currentItem.id,
                targetPriceId,
                this.buildChangeMetadata(pendingChange, 'immediate_plan_change'),
            ) as any;
            const paymentIntent = updatedStripeSub.latest_invoice?.payment_intent as any;
            const requiresAction = paymentIntent?.status === 'requires_action';

            if (!requiresAction && !updatedStripeSub.pending_update) {
                const saved = await this.syncLocalSubscriptionFromStripe(
                    currentSub,
                    updatedStripeSub,
                    plan,
                    dto.billingCycle,
                    null,
                );
                return {
                    requiresAction: false,
                    subscription: saved,
                };
            }

            const pending = await this.repository.Update(new ObjectId(currentSub._id), {
                cancelAtPeriodEnd: false,
                pendingChange,
                updatedAt: Utils.getCurrentDate(),
            }, subscriptionResponseFields) as ISubscription;

            return {
                requiresAction,
                ...(requiresAction ? { clientSecret: paymentIntent?.client_secret } : {}),
                subscription: pending,
            };
        }

        if (currentSub.cancelAtPeriodEnd) {
            await stripe.getStripeInstance().subscriptions.update(currentSub.stripeSubscriptionId, {
                cancel_at_period_end: false,
            });
        }

        const schedule = await this.prepareSubscriptionSchedule(currentSub, stripeSub);
        const currentPeriodStart = Number(stripeSub.current_period_start || Math.floor(Date.now() / 1000));
        const currentPeriodEnd = Number(stripeSub.current_period_end || Math.floor(Date.now() / 1000));
        const targetPeriodEnd = this.addBillingCycle(new Date(currentPeriodEnd * 1000), dto.billingCycle).getTime() / 1000;
        const scheduleMetadata = this.buildChangeMetadata(pendingChange, 'scheduled_plan_change');
        const scheduleItems = [{ price: currentItem.price?.id || currentItem.price, quantity: currentItem.quantity || 1 }];

        const updatedSchedule = await stripe.updateSubscriptionSchedule(schedule.id, {
            end_behavior: 'release',
            proration_behavior: 'none',
            phases: [
                {
                    start_date: currentPeriodStart,
                    end_date: currentPeriodEnd,
                    items: scheduleItems,
                    metadata: scheduleMetadata,
                },
                {
                    start_date: currentPeriodEnd,
                    end_date: targetPeriodEnd,
                    items: [{ price: targetPriceId, quantity: 1 }],
                    proration_behavior: 'none',
                    metadata: scheduleMetadata,
                },
            ],
        });

        const saved = await this.repository.Update(new ObjectId(currentSub._id), {
            cancelAtPeriodEnd: false,
            stripeScheduleId: updatedSchedule.id,
            pendingChange,
            updatedAt: Utils.getCurrentDate(),
        }, subscriptionResponseFields) as ISubscription;

        return { requiresAction: false, subscription: saved };
    }

    private buildChangeMetadata(change: IPendingSubscriptionChange, changeType: string): Record<string, string> {
        return {
            changeType,
            targetPlanId: change.planId,
            targetPlanName: change.planName || '',
            targetBillingCycle: change.billingCycle,
            previousPlanId: change.previousPlanId,
            previousPlanName: change.previousPlanName || '',
            previousBillingCycle: change.previousBillingCycle || '',
        };
    }

    private addBillingCycle(date: Date, billingCycle: BillingCycle): Date {
        const next = new Date(date);
        if (billingCycle === BillingCycle.YEARLY) {
            next.setUTCFullYear(next.getUTCFullYear() + 1);
        } else {
            next.setUTCMonth(next.getUTCMonth() + 1);
        }
        return next;
    }

    private async prepareSubscriptionSchedule(currentSub: ISubscription, stripeSub: any): Promise<any> {
        const stripe = StripeService.getInstance();
        const existingScheduleId = typeof stripeSub.schedule === 'string'
            ? stripeSub.schedule
            : stripeSub.schedule?.id || currentSub.stripeScheduleId;

        if (existingScheduleId) {
            const schedule = await stripe.getSubscriptionSchedule(existingScheduleId);
            if (schedule.status === 'active' || schedule.status === 'not_started') {
                return schedule;
            }
        }

        return await stripe.createSubscriptionSchedule(currentSub.stripeSubscriptionId!);
    }

    private async releaseScheduleIfPresent(currentSub: ISubscription, stripeSub?: any): Promise<void> {
        const stripe = StripeService.getInstance();
        const resolvedStripeSub = stripeSub || (currentSub.stripeSubscriptionId
            ? await stripe.getSubscription(currentSub.stripeSubscriptionId) as any
            : null);
        const scheduleId = typeof resolvedStripeSub?.schedule === 'string'
            ? resolvedStripeSub.schedule
            : resolvedStripeSub?.schedule?.id || currentSub.stripeScheduleId;

        if (!scheduleId) return;

        try {
            const schedule = await stripe.getSubscriptionSchedule(scheduleId);
            if (schedule.status === 'active' || schedule.status === 'not_started') {
                await stripe.releaseSubscriptionSchedule(scheduleId);
            }
        } catch (error: any) {
            // Stripe may already have released/completed the schedule between reads.
            if (!String(error?.message || '').toLowerCase().includes('cannot')) {
                throw error;
            }
        }
    }

    private async getPlanByStripePriceId(priceId: string): Promise<{ plan: any; billingCycle: BillingCycle } | null> {
        const plan = await PlansRepository.getInstance().collection.findOne({
            $or: [
                { stripePriceId: priceId },
                { stripePriceIdYearly: priceId },
            ],
        }) as any;

        if (!plan) return null;
        return {
            plan,
            billingCycle: plan.stripePriceIdYearly === priceId ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
        };
    }

    private async syncLocalSubscriptionFromStripe(
        currentSub: ISubscription,
        stripeSub: any,
        plan?: any,
        billingCycle?: BillingCycle,
        pendingChange: IPendingSubscriptionChange | null = null,
    ): Promise<ISubscription> {
        const stripeItem = stripeSub.items?.data?.[0];
        const resolvedPlan = plan || (stripeItem?.price?.id ? (await this.getPlanByStripePriceId(stripeItem.price.id))?.plan : null);
        const resolvedBillingCycle = billingCycle || (stripeItem?.price?.id
            ? (await this.getPlanByStripePriceId(stripeItem.price.id))?.billingCycle
            : undefined);

        const updated = await this.repository.Update(new ObjectId(currentSub._id), {
            planId: resolvedPlan?.planId || currentSub.planId,
            planName: resolvedPlan?.name || currentSub.planName,
            billingCycle: resolvedBillingCycle || currentSub.billingCycle,
            status: this.mapStripeStatus(stripeSub.status),
            isActive: !['canceled', 'incomplete_expired'].includes(stripeSub.status),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
            currentPeriodStart: stripeSub.current_period_start
                ? new Date(stripeSub.current_period_start * 1000)
                : currentSub.currentPeriodStart,
            currentPeriodEnd: stripeSub.current_period_end
                ? new Date(stripeSub.current_period_end * 1000)
                : currentSub.currentPeriodEnd,
            pendingChange,
            stripeScheduleId: typeof stripeSub.schedule === 'string'
                ? stripeSub.schedule
                : stripeSub.schedule?.id || null,
            updatedAt: Utils.getCurrentDate(),
        }, subscriptionResponseFields) as ISubscription;

        return updated;
    }

    private async markTenantUnpaid(tenantId: string): Promise<void> {
        const company = await OnboardingRepository.getInstance().GetOneByParam<ICompany | null>(
            { param: 'tenantId', value: tenantId },
            ['_id', 'tenantStatus'],
        );
        if (!company?._id) return;

        await OnboardingRepository.getInstance().Update(new ObjectId(company._id), {
            isPaymentCompleted: false,
            ...(company.tenantStatus === TenantStatus.SUSPENDED ? {} : { tenantStatus: TenantStatus.TRIAL }),
            updatedAt: Utils.getCurrentDate(),
        });
    }

    //* -------------------------------------------------------------------------- */
    //*                    HANDLE STRIPE WEBHOOK EVENTS                            */
    //* -------------------------------------------------------------------------- */
    public async handleStripeWebhook(event: any): Promise<void> {
        try {
            switch (event.type) {
                case 'invoice.payment_succeeded':
                    await this.onInvoicePaymentSucceeded(event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await this.onInvoicePaymentFailed(event.data.object);
                    break;
                case 'customer.subscription.updated':
                    await this.onSubscriptionUpdated(event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await this.onSubscriptionDeleted(event.data.object);
                    break;
                case 'subscription_schedule.completed':
                case 'subscription_schedule.released':
                case 'subscription_schedule.canceled':
                    await this.onSubscriptionScheduleFinished(event.data.object);
                    break;
                default:
                    break;
            }
        } catch (err: any) {
            console.error(`Stripe webhook handler error [${event.type}]: ${err.message}`);
        }
    }

    private async onInvoicePaymentSucceeded(invoice: any): Promise<void> {
        const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!stripeSubId) return;

        const sub = await this.findByStripeSubId(stripeSubId);
        if (!sub) return;

        const stripeSub = await StripeService.getInstance().getSubscription(stripeSubId) as any;
        const priceId = stripeSub.items?.data?.[0]?.price?.id;
        const resolvedPlan = priceId ? await this.getPlanByStripePriceId(priceId) : null;
        const changeType = stripeSub.metadata?.changeType || '';
        const updatedSub = await this.syncLocalSubscriptionFromStripe(
            sub,
            stripeSub,
            resolvedPlan?.plan,
            resolvedPlan?.billingCycle,
            changeType ? null : sub.pendingChange || null,
        );

        const company = await OnboardingRepository.getInstance().GetOneByParam<ICompany | null>(
            { param: 'tenantId', value: sub.tenantId },
            ['_id', 'tenantStatus']
        );
        if (company?._id) {
            await OnboardingRepository.getInstance().Update(
                new ObjectId(company._id),
                {
                    tenantStatus: TenantStatus.ACTIVE,
                    isPaymentCompleted: true,
                    updatedAt: Utils.getCurrentDate(),
                }
            );
        }

        const paymentIntentId = this.resolveStripeObjectId(invoice.payment_intent) || `invoice:${invoice.id}`;
        const purpose = await this.resolveTransactionPurpose(sub, updatedSub, stripeSub, invoice);
        const alreadyRecorded = await TransactionHistoryService.getInstance().findByStripePaymentIntentId(paymentIntentId);
        if (!alreadyRecorded) {
            await TransactionHistoryService.getInstance().create({
                tenantId: sub.tenantId,
                subscriptionId: (updatedSub as any)._id?.toString(),
                stripePaymentIntentId: paymentIntentId,
                stripeInvoiceId: invoice.id,
                amount: (invoice.amount_paid || 0) / 100,
                currency: invoice.currency,
                status: PaymentStatus.SUCCEEDED,
                purpose,
                metadata: {
                    purpose,
                    planId: updatedSub.planId,
                    planName: updatedSub.planName || updatedSub.planId,
                    billingCycle: updatedSub.billingCycle,
                    periodStart: updatedSub.currentPeriodStart ? new Date(updatedSub.currentPeriodStart).toISOString() : undefined,
                    periodEnd: updatedSub.currentPeriodEnd ? new Date(updatedSub.currentPeriodEnd).toISOString() : undefined,
                    previousPlanId: stripeSub.metadata?.previousPlanId || undefined,
                    previousPlanName: stripeSub.metadata?.previousPlanName || undefined,
                    previousBillingCycle: stripeSub.metadata?.previousBillingCycle || undefined,
                },
                paidAt: new Date(),
            });
        }

        if (changeType) {
            await this.clearStripeChangeMetadata(stripeSubId);
        }
    }

    private async onInvoicePaymentFailed(invoice: any): Promise<void> {
        const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!stripeSubId) return;

        const sub = await this.findByStripeSubId(stripeSubId);
        if (!sub) return;

        await this.repository.Update(new ObjectId(sub._id), {
            status: SubscriptionStatus.PAST_DUE,
            updatedAt: Utils.getCurrentDate(),
        });

        const paymentIntentId = this.resolveStripeObjectId(invoice.payment_intent) || `invoice:${invoice.id}`;
        const alreadyRecorded = await TransactionHistoryService.getInstance().findByStripePaymentIntentId(paymentIntentId);
        if (!alreadyRecorded) {
            await TransactionHistoryService.getInstance().create({
                tenantId: sub.tenantId,
                subscriptionId: (sub as any)._id?.toString(),
                stripePaymentIntentId: paymentIntentId,
                stripeInvoiceId: invoice.id,
                amount: (invoice.amount_due || 0) / 100,
                currency: invoice.currency,
                status: PaymentStatus.FAILED,
            });
        }
    }

    private async onSubscriptionUpdated(stripeSub: any): Promise<void> {
        const sub = await this.findByStripeSubId(stripeSub.id);
        if (!sub) return;

        const priceId = stripeSub.items?.data?.[0]?.price?.id;
        const resolvedPlan = priceId ? await this.getPlanByStripePriceId(priceId) : null;
        const scheduleId = typeof stripeSub.schedule === 'string'
            ? stripeSub.schedule
            : stripeSub.schedule?.id;
        await this.syncLocalSubscriptionFromStripe(
            sub,
            stripeSub,
            resolvedPlan?.plan,
            resolvedPlan?.billingCycle,
            stripeSub.metadata?.changeType || scheduleId ? sub.pendingChange || null : null,
        );

        const company = await OnboardingRepository.getInstance().GetOneByParam<ICompany | null>(
            { param: 'tenantId', value: sub.tenantId },
            ['_id', 'tenantStatus']
        );
        if (company?._id) {
            await OnboardingRepository.getInstance().Update(
                new ObjectId(company._id),
                {
                    tenantStatus: stripeSub.status === 'trialing' ? TenantStatus.TRIAL : TenantStatus.ACTIVE,
                    updatedAt: Utils.getCurrentDate(),
                }
            );
        }
    }

    private async onSubscriptionDeleted(stripeSub: any): Promise<void> {
        const sub = await this.findByStripeSubId(stripeSub.id);
        if (!sub) return;

        await this.repository.Update(new ObjectId(sub._id), {
            isActive: false,
            status: SubscriptionStatus.CANCELED,
            cancelAtPeriodEnd: false,
            pendingChange: null,
            stripeScheduleId: null,
            supersededAt: new Date(),
            updatedAt: Utils.getCurrentDate(),
        });

        const company = await OnboardingRepository.getInstance().GetOneByParam<ICompany | null>(
            { param: 'tenantId', value: sub.tenantId },
            ['_id', 'tenantStatus']
        );
        if (company?._id && company.tenantStatus !== TenantStatus.SUSPENDED) {
            await OnboardingRepository.getInstance().Update(
                new ObjectId(company._id),
                {
                    tenantStatus: TenantStatus.TRIAL,
                    isPaymentCompleted: false,
                    updatedAt: Utils.getCurrentDate(),
                }
            );
        }
    }

    private async onSubscriptionScheduleFinished(schedule: any): Promise<void> {
        const subscriptionId = this.resolveStripeObjectId(schedule.subscription);
        if (!subscriptionId) return;

        const sub = await this.findByStripeSubId(subscriptionId);
        if (!sub) return;

        await this.repository.Update(new ObjectId(sub._id), {
            stripeScheduleId: null,
            pendingChange: null,
            updatedAt: Utils.getCurrentDate(),
        });
    }

    private resolveStripeObjectId(value: any): string | null {
        if (!value) return null;
        return typeof value === 'string' ? value : value.id || null;
    }

    private async resolveTransactionPurpose(sub: ISubscription, updatedSub: ISubscription, stripeSub: any, invoice: any): Promise<TransactionPurpose> {
        const pendingChange = sub.pendingChange;
        const changeType = stripeSub.metadata?.changeType || (pendingChange ? 'scheduled_plan_change' : '');
        if (changeType.includes('plan_change')) {
            const previousPlanId = stripeSub.metadata?.previousPlanId || pendingChange?.previousPlanId || sub.planId;
            const previousBillingCycle = stripeSub.metadata?.previousBillingCycle || pendingChange?.previousBillingCycle || sub.billingCycle;
            if (previousPlanId === updatedSub.planId && previousBillingCycle !== updatedSub.billingCycle) {
                return TransactionPurpose.BILLING_CYCLE_CHANGE;
            }

            const [previousPlan, targetPlan] = await Promise.all([
                PlansRepository.getInstance().GetOneByParams(
                    [{ param: 'planId', value: previousPlanId, operator: QueryOperators.AND }],
                    ['planId', 'displayOrder'],
                ) as Promise<any>,
                PlansRepository.getInstance().GetOneByParams(
                    [{ param: 'planId', value: updatedSub.planId, operator: QueryOperators.AND }],
                    ['planId', 'displayOrder'],
                ) as Promise<any>,
            ]);

            return (targetPlan?.displayOrder ?? 0) < (previousPlan?.displayOrder ?? 0)
                ? TransactionPurpose.PLAN_DOWNGRADE
                : TransactionPurpose.PLAN_UPGRADE;
        }

        if (invoice.billing_reason === 'subscription_create') return TransactionPurpose.INITIAL_SUBSCRIPTION;
        return TransactionPurpose.SUBSCRIPTION_RENEWAL;
    }

    private async clearStripeChangeMetadata(stripeSubscriptionId: string): Promise<void> {
        await StripeService.getInstance().getStripeInstance().subscriptions.update(stripeSubscriptionId, {
            metadata: {
                changeType: '',
                targetPlanId: '',
                targetPlanName: '',
                targetBillingCycle: '',
                previousPlanId: '',
                previousPlanName: '',
                previousBillingCycle: '',
            },
        });
    }

    private async findByStripeSubId(stripeSubscriptionId: string): Promise<ISubscription | null> {
        return await this.repository.GetOneByParams(
            [{ param: 'stripeSubscriptionId', value: stripeSubscriptionId, operator: QueryOperators.AND }],
            subscriptionResponseFields,
        ) as ISubscription | null;
    }

    private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
        switch (stripeStatus) {
            case 'active':      return SubscriptionStatus.ACTIVE;
            case 'past_due':    return SubscriptionStatus.PAST_DUE;
            case 'canceled':    return SubscriptionStatus.CANCELED;
            case 'trialing':    return SubscriptionStatus.TRIALING;
            case 'incomplete':  return SubscriptionStatus.INCOMPLETE;
            default:            return SubscriptionStatus.ACTIVE;
        }
    }
}

export default SubscriptionsService;
