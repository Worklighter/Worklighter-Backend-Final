import { HttpStatusCode } from 'axios';
import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../core/errors/custom';
import QueryOperators from '../core/enums/queryOperators';
import SubscriptionStatus from '../core/enums/subscriptionStatus';
import SubscriptionsRepository from '../modules/subscriptions/subscriptionsRepository';
import OnboardingRepository from '../modules/company/companyRepository';

const ALLOWED_STATUSES = new Set<SubscriptionStatus | string>([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
]);

const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.Forbidden, 'Tenant subscription is required');
    }

    const company = await OnboardingRepository.getInstance().GetOneByParam<{
        isPaymentCompleted?: boolean;
        tenantStatus?: string | null;
    }>(
        { param: 'tenantId', value: tenantId },
        ['isPaymentCompleted', 'tenantStatus']
    );

    const activeSub = await SubscriptionsRepository.getInstance().GetOneByParams(
        [
            { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
            { param: 'isActive', value: true, operator: QueryOperators.AND },
        ],
        ['_id', 'status', 'cancelAtPeriodEnd']
    );

    if (!company?.isPaymentCompleted && !activeSub) {
        throw new CustomError(
            HttpStatusCode.PaymentRequired,
            'Please subscribe to continue',
        );
    }

    if (activeSub && !ALLOWED_STATUSES.has((activeSub as any).status)) {
        throw new CustomError(
            HttpStatusCode.PaymentRequired,
            'Please subscribe to continue',
        );
    }

    next();
};

export default requireActiveSubscription;
