import { HttpStatusCode } from 'axios';
import { ObjectId } from 'mongodb';
import AuditEventTypes from '../../core/enums/auditEventTypes';
import BillingCycle from '../../core/enums/billingCycle';
import JwtTypes from '../../core/enums/jwtTypes';
import PaymentStatus from '../../core/enums/paymentStatus';
import QueryOperators from '../../core/enums/queryOperators';
import QueryOperationTypes from '../../core/enums/queryOperationTypes';
import StatusTypes from '../../core/enums/statusTypes';
import SubscriptionStatus from '../../core/enums/subscriptionStatus';
import TenantStatus from '../../core/enums/tenantStatus';
import UserRoles from '../../core/enums/userRoles';
import { CustomError } from '../../core/errors/custom';
import IJWTPayload from '../../core/interfaces/jwt';
import { Utils } from '../../utils/utils';
import AuditLogger from '../../utils/helpers/auditLogger';
import SecurityManager from '../../utils/helpers/securityManager';
import TokenManager from '../../utils/helpers/tokenManager';
import EmailTemplateTypes from '../../core/enums/emailTemplateTypes';
import OtpService from '../otp/otpService';
import OnboardingRepository from '../company/companyRepository';
import UsersRepository from '../users/usersRepository';
import SubscriptionsRepository from '../subscriptions/subscriptionsRepository';
import TransactionHistoryRepository from '../transactionHistory/transactionHistoryRepository';
import { PlansRepository } from '../plans/plansRepository';
import { IPlan } from '../plans/plansInterface';
import { ICompany } from '../company/companyInterface';
import { IUsers } from '../users/usersInterface';
import { ISubscription } from '../subscriptions/subscriptionsInterface';
import { ITransactionHistory } from '../transactionHistory/transactionHistoryInterface';
import SubscriptionsService from '../subscriptions/subscriptionsService';
import {
    IAdminBillingRow,
    IAdminBillingQuery,
    IAdminPlanInput,
    IAdminTenantDetail,
    IAdminTenantStatusInput,
    IAdminTenantSummary,
    IAdminTenantsQuery,
    IAdminUserRow,
    IAdminUsersQuery,
    adminPlanResponseFields,
} from './adminInterface';

type TenantSnapshot = {
    company: ICompany;
    owner: IUsers | null;
    activeSubscription: ISubscription | null;
    latestSubscription: ISubscription | null;
    plan: IPlan | null;
    latestTransaction: ITransactionHistory | null;
    activeUsers: IUsers[];
    totalUsers: IUsers[];
    activeTokenCountByUser: Map<string, number>;
};

class AdminService {
    private static instance: AdminService;

    public static getInstance(): AdminService {
        if (!AdminService.instance) {
            AdminService.instance = new AdminService();
        }
        return AdminService.instance;
    }

    private async loadSnapshots(tenantFilter?: string[]): Promise<TenantSnapshot[]> {
        const companies = await OnboardingRepository.getInstance().collection
            .find({ deletedAt: null })
            .sort({ createdAt: -1 })
            .toArray() as unknown as ICompany[];

        const filteredCompanies = tenantFilter?.length
            ? companies.filter((company) => tenantFilter.includes(company.tenantId))
            : companies;

        const tenantIds = filteredCompanies.map((company) => company.tenantId).filter(Boolean);
        if (!tenantIds.length) {
            return [];
        }

        const [users, subscriptions, plans, transactions] = await Promise.all([
            UsersRepository.getInstance().collection
                .find({ tenantId: { $in: tenantIds }, deletedAt: null })
                .toArray() as unknown as IUsers[],
            SubscriptionsRepository.getInstance().collection
                .find({ tenantId: { $in: tenantIds } })
                .sort({ createdAt: -1 })
                .toArray() as unknown as ISubscription[],
            PlansRepository.getInstance().collection
                .find({})
                .sort({ displayOrder: 1 })
                .toArray() as unknown as IPlan[],
            TransactionHistoryRepository.getInstance().collection
                .find({ tenantId: { $in: tenantIds } })
                .sort({ createdAt: -1 })
                .toArray() as unknown as ITransactionHistory[],
        ]);

        const userMapById = new Map<string, IUsers>();
        const usersByTenant = new Map<string, IUsers[]>();
        const activeTokenCountByUser = new Map<string, number>();

        for (const user of users) {
            const userId = user._id.toString();
            userMapById.set(userId, user);
            const tenantUsers = usersByTenant.get(user.tenantId) || [];
            tenantUsers.push(user);
            usersByTenant.set(user.tenantId, tenantUsers);
        }

        const tokensByUser = await UsersRepository.getInstance().collection.aggregate([
            {
                $match: {
                    tenantId: { $in: tenantIds },
                    deletedAt: null,
                },
            },
            {
                $lookup: {
                    from: 'issued_tokens',
                    let: { userId: { $toString: '$_id' } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$userId', '$$userId'] },
                                        { $eq: ['$isActive', true] },
                                    ],
                                },
                            },
                        },
                        { $count: 'count' },
                    ],
                    as: 'activeTokens',
                },
            },
            {
                $project: {
                    _id: 1,
                    tenantId: 1,
                    activeTokenCount: {
                        $ifNull: [{ $arrayElemAt: ['$activeTokens.count', 0] }, 0],
                    },
                },
            },
        ]).toArray() as Array<{ _id: ObjectId; tenantId: string; activeTokenCount: number }>;

        for (const tokenRow of tokensByUser) {
            activeTokenCountByUser.set(tokenRow._id.toString(), tokenRow.activeTokenCount || 0);
        }

        const activeSubscriptionByTenant = new Map<string, ISubscription>();
        const latestSubscriptionByTenant = new Map<string, ISubscription>();
        for (const subscription of subscriptions) {
            if (!latestSubscriptionByTenant.has(subscription.tenantId)) {
                latestSubscriptionByTenant.set(subscription.tenantId, subscription);
            }
            if (subscription.isActive && !activeSubscriptionByTenant.has(subscription.tenantId)) {
                activeSubscriptionByTenant.set(subscription.tenantId, subscription);
            }
        }

        const planByPlanId = new Map<string, IPlan>();
        for (const plan of plans) {
            planByPlanId.set(plan.planId, plan);
        }

        const latestTransactionByTenant = new Map<string, ITransactionHistory>();
        for (const transaction of transactions) {
            if (!latestTransactionByTenant.has(transaction.tenantId)) {
                latestTransactionByTenant.set(transaction.tenantId, transaction);
            }
        }

        return filteredCompanies.map((company) => {
            const owner = userMapById.get(company.ownerId) || null;
            const activeSubscription = activeSubscriptionByTenant.get(company.tenantId) || null;
            const latestSubscription = latestSubscriptionByTenant.get(company.tenantId) || null;
            const plan = (activeSubscription || latestSubscription)
                ? planByPlanId.get((activeSubscription || latestSubscription).planId) || null
                : null;
            const tenantUsers = usersByTenant.get(company.tenantId) || [];
            const activeUsers = tenantUsers.filter((user) => user.accountStatus === StatusTypes.ACTIVE);

            return {
                company,
                owner,
                activeSubscription,
                latestSubscription,
                plan,
                latestTransaction: latestTransactionByTenant.get(company.tenantId) || null,
                activeUsers,
                totalUsers: tenantUsers,
                activeTokenCountByUser,
            };
        });
    }

    private resolveTenantStatus(company: ICompany, subscription: ISubscription | null): TenantStatus {
        if (company.tenantStatus === TenantStatus.SUSPENDED) {
            return TenantStatus.SUSPENDED;
        }

        if (company.tenantStatus === TenantStatus.TRIAL) {
            return TenantStatus.TRIAL;
        }

        if (subscription?.status === SubscriptionStatus.TRIALING) {
            return TenantStatus.TRIAL;
        }

        if (company.isPaymentCompleted === false) {
            return TenantStatus.TRIAL;
        }

        return TenantStatus.ACTIVE;
    }

    private resolvePlanType(plan: IPlan | null, subscription: ISubscription | null, company: ICompany): string {
        if (plan?.name) {
            return plan.name;
        }

        if (subscription?.planName) {
            return subscription.planName;
        }

        if (company.isPaymentCompleted) {
            return 'Unassigned';
        }

        return 'Trial';
    }

    private resolveLastActivity(company: ICompany, subscription: ISubscription | null, latestTransaction: ITransactionHistory | null): string | null {
        const candidates: string[] = [];
        if (company.updatedAt) candidates.push(company.updatedAt);
        if (company.completedAt) candidates.push(company.completedAt);
        if (latestTransaction?.createdAt) candidates.push(latestTransaction.createdAt);
        if (subscription?.updatedAt) candidates.push(subscription.updatedAt);
        if (company.lastActivity && typeof company.lastActivity === 'object') {
            candidates.push(...Object.values(company.lastActivity).filter(Boolean) as string[]);
        }

        const parsed = candidates
            .map((value) => new Date(value))
            .filter((value) => !Number.isNaN(value.getTime()))
            .map((value) => value.toISOString());

        if (!parsed.length) {
            return company.createdAt || null;
        }

        return parsed.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    }

    private buildTenantSummary(snapshot: TenantSnapshot): IAdminTenantSummary {
        const { company, owner, activeSubscription, latestSubscription, plan, latestTransaction, activeUsers, totalUsers } = snapshot;
        const subscription = activeSubscription || latestSubscription;

        return {
            tenantId: company.tenantId,
            companyId: company._id?.toString() || '',
            companyName: company.companyName || 'Unnamed Company',
            adminEmail: owner?.email || company.assignedEmail || '',
            planType: this.resolvePlanType(plan, subscription, company),
            status: this.resolveTenantStatus(company, subscription),
            subscriptionStatus: subscription?.status || null,
            lastActivityDate: this.resolveLastActivity(company, subscription, latestTransaction),
            activeUsers: activeUsers.length,
            totalUsers: totalUsers.length,
            ownerId: company.ownerId,
        };
    }

    private buildBillingRow(snapshot: TenantSnapshot): IAdminBillingRow {
        const { company, owner, activeSubscription, latestSubscription, plan, latestTransaction } = snapshot;
        const subscription = activeSubscription || latestSubscription;
        const billingCycle = subscription?.billingCycle || null;
        const amount = latestTransaction?.amount || (
            plan
                ? (billingCycle === BillingCycle.YEARLY ? plan.yearlyPrice : plan.monthlyPrice)
                : 0
        );

        return {
            tenantId: company.tenantId,
            companyName: company.companyName || 'Unnamed Company',
            adminEmail: owner?.email || company.assignedEmail || '',
            planType: this.resolvePlanType(plan, subscription, company),
            billingCycle,
            subscriptionStatus: subscription?.status || null,
            paymentStatus: latestTransaction?.status || subscription?.status || null,
            amount,
            currency: latestTransaction?.currency || plan?.currency || 'usd',
            stripeCustomerId: subscription?.stripeCustomerId || null,
            stripeSubscriptionId: subscription?.stripeSubscriptionId || null,
            currentPeriodEnd: subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : null,
            lastPaymentDate: latestTransaction?.paidAt ? new Date(latestTransaction.paidAt).toISOString() : null,
            isActive: Boolean(subscription?.isActive),
            cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
            pendingChange: subscription?.pendingChange ? subscription.pendingChange as unknown as Record<string, unknown> : null,
            canTerminate: Boolean(subscription?.isActive && subscription?.stripeSubscriptionId),
        };
    }

    private buildUserRow(snapshot: TenantSnapshot, user: IUsers): IAdminUserRow {
        const { company, activeTokenCountByUser } = snapshot;
        return {
            userId: user._id.toString(),
            tenantId: user.tenantId,
            tenantName: company.companyName || 'Unnamed Company',
            email: user.email,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.fullName || user.email,
            role: user.role,
            status: user.accountStatus === StatusTypes.ACTIVE ? 'Active' : 'Inactive',
            activeTokenCount: activeTokenCountByUser.get(user._id.toString()) || 0,
            createdAt: user.createdAt || null,
            updatedAt: user.updatedAt || null,
        };
    }

    public async listTenants(data: IAdminTenantsQuery, loggedInUser: IJWTPayload) {
        const snapshots = await this.loadSnapshots();
        const searchText = (data.searchText || '').trim().toLowerCase();
        const statusFilter = (data.status || 'All') as string;
        const planFilter = (data.planType || '').trim().toLowerCase();

        const rows = snapshots
            .map((snapshot) => this.buildTenantSummary(snapshot))
            .filter((row) => {
                const matchesSearch = !searchText
                    || row.companyName.toLowerCase().includes(searchText)
                    || row.adminEmail.toLowerCase().includes(searchText)
                    || row.tenantId.toLowerCase().includes(searchText)
                    || row.planType.toLowerCase().includes(searchText);

                const matchesStatus = statusFilter === 'All' || row.status === statusFilter;
                const matchesPlan = !planFilter || row.planType.toLowerCase().includes(planFilter);

                return matchesSearch && matchesStatus && matchesPlan;
            });

        const currentPage = Math.max(parseInt(String(data.continuationToken || '1'), 10) || 1, 1);
        const pageSize = Math.max(parseInt(String(data.pageSize || '10'), 10) || 10, 1);
        const total = rows.length;
        const start = (currentPage - 1) * pageSize;
        const paginatedRows = rows.slice(start, start + pageSize);
        const lastPage = start + pageSize >= total;
        const nextContinuationToken = lastPage ? null : String(currentPage + 1);

        const summary = {
            totalCompanies: rows.length,
            activeCompanies: rows.filter((row) => row.status === TenantStatus.ACTIVE).length,
            trialCompanies: rows.filter((row) => row.status === TenantStatus.TRIAL).length,
            suspendedCompanies: rows.filter((row) => row.status === TenantStatus.SUSPENDED).length,
            totalActiveUsers: rows.reduce((sum, row) => sum + row.activeUsers, 0),
        };

        return {
            tenants: paginatedRows,
            summary,
            pagination: {
                lastPage,
                firstPage: 1,
                count: paginatedRows.length,
                continuationToken: nextContinuationToken,
                total,
            },
        };
    }

    public async getTenantDetail(tenantId: string, loggedInUser: IJWTPayload): Promise<IAdminTenantDetail> {
        const snapshots = await this.loadSnapshots([tenantId]);
        const snapshot = snapshots[0];
        if (!snapshot) {
            throw new CustomError(HttpStatusCode.NotFound, 'Tenant not found');
        }

        return {
            ...this.buildTenantSummary(snapshot),
            company: snapshot.company,
            users: snapshot.totalUsers.map((user) => this.buildUserRow(snapshot, user)),
            subscription: snapshot.activeSubscription || snapshot.latestSubscription || null,
            billing: this.buildBillingRow(snapshot),
            plan: snapshot.plan,
        };
    }

    public async updateTenantStatus(tenantId: string, dto: IAdminTenantStatusInput, loggedInUser: IJWTPayload) {
        const company = await OnboardingRepository.getInstance().GetOneByParam<ICompany>(
            { param: 'tenantId', value: tenantId },
            ['_id', 'tenantId', 'companyName', 'tenantStatus', 'ownerId', 'isPaymentCompleted']
        );

        if (!company?._id) {
            throw new CustomError(HttpStatusCode.NotFound, 'Tenant not found');
        }

        const snapshots = await this.loadSnapshots([tenantId]);
        const snapshot = snapshots[0];
        const status = dto.status;

        await OnboardingRepository.getInstance().Update(
            new ObjectId(company._id),
            {
                tenantStatus: status,
                updatedAt: Utils.getCurrentDate(),
            },
            ['_id', 'tenantId', 'companyName', 'tenantStatus']
        );

        if (status === TenantStatus.SUSPENDED && snapshot) {
            await Promise.all(snapshot.totalUsers.map((user) => TokenManager.revokeAllUserTokens(user._id.toString())));
        }

        await AuditLogger.write({
            submissionId: `admin:${tenantId}`,
            tenantId,
            event: status === TenantStatus.SUSPENDED
                ? AuditEventTypes.TENANT_SUSPENDED
                : AuditEventTypes.TENANT_REACTIVATED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                status,
                reason: dto.reason || null,
                companyName: company.companyName,
            },
        });

        return this.getTenantDetail(tenantId, loggedInUser);
    }

    public async terminateSubscription(tenantId: string, loggedInUser: IJWTPayload) {
        const snapshot = (await this.loadSnapshots([tenantId]))[0];
        if (!snapshot) {
            throw new CustomError(HttpStatusCode.NotFound, 'Tenant not found');
        }

        if (!snapshot.activeSubscription?.isActive) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Tenant has no active subscription to terminate');
        }

        const subscription = await SubscriptionsService.getInstance().cancelSubscription(tenantId, true);

        await AuditLogger.write({
            submissionId: `admin:subscription:${tenantId}`,
            tenantId,
            event: AuditEventTypes.SUBSCRIPTION_TERMINATED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                stripeSubscriptionId: subscription.stripeSubscriptionId || null,
                planId: subscription.planId,
                planName: subscription.planName || null,
            },
        });

        return this.getTenantDetail(tenantId, loggedInUser);
    }

    public async impersonateTenant(tenantId: string, loggedInUser: IJWTPayload) {
        const snapshots = await this.loadSnapshots([tenantId]);
        const snapshot = snapshots[0];

        if (!snapshot) {
            throw new CustomError(HttpStatusCode.NotFound, 'Tenant not found');
        }

        const ownerUser = snapshot.owner;
        const fallbackUser = snapshot.totalUsers.find((user) => user.role === UserRoles.ADMIN || user.role === UserRoles.PROJECTMANAGER) || snapshot.totalUsers[0] || null;
        const impersonationUser = ownerUser || fallbackUser;

        if (!impersonationUser) {
            throw new CustomError(HttpStatusCode.NotFound, 'No tenant user available for impersonation');
        }

        const expiresIn = '15m';
        const jwtPayload = {
            id: impersonationUser._id.toString(),
            username: impersonationUser.username,
            email: impersonationUser.email,
            role: impersonationUser.role,
            tenantId: impersonationUser.tenantId,
            jwtType: JwtTypes.API,
        };

        const impersonationToken = await SecurityManager.generateJWT(jwtPayload, JwtTypes.API, expiresIn);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await TokenManager.issueToken(
            impersonationToken,
            impersonationUser._id.toString(),
            impersonationUser.tenantId,
            expiresAt,
        );

        await AuditLogger.write({
            submissionId: `admin:${tenantId}`,
            tenantId,
            event: AuditEventTypes.TENANT_IMPERSONATED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                impersonatedUserId: impersonationUser._id.toString(),
                impersonatedEmail: impersonationUser.email,
            },
        });

        return {
            accessToken: impersonationToken,
            expiresAt: expiresAt.toISOString(),
            tenant: this.buildTenantSummary(snapshot),
            user: {
                id: impersonationUser._id.toString(),
                firstName: impersonationUser.firstName,
                lastName: impersonationUser.lastName,
                email: impersonationUser.email,
                username: impersonationUser.username,
                role: impersonationUser.role,
                tenantId: impersonationUser.tenantId,
            },
        };
    }

    public async listPlans() {
        const plans = await PlansRepository.getInstance().GetAll(
            [],
            false,
            null,
            0,
            { displayOrder: 1 },
            adminPlanResponseFields,
        ) as IPlan[];

        return {
            plans,
            summary: {
                totalPlans: plans.length,
                activePlans: plans.filter((plan) => plan.isActive).length,
                publicPlans: plans.filter((plan) => plan.isPublic).length,
            },
        };
    }

    public async createPlan(data: IAdminPlanInput, loggedInUser: IJWTPayload) {
        const existingPlan = await PlansRepository.getInstance().GetOneByParam<IPlan>(
            { param: 'planId', value: data.planId },
            ['_id', 'planId']
        );

        if (existingPlan?._id) {
            throw new CustomError(HttpStatusCode.Conflict, 'A plan with this planId already exists');
        }

        const now = Utils.getCurrentDate();
        const planRecord = {
            ...data,
            createdAt: now,
            createdBy: loggedInUser.id,
            updatedAt: now,
            updatedBy: loggedInUser.id,
        };

        const createdPlan = await PlansRepository.getInstance().Add(planRecord, adminPlanResponseFields) as IPlan;

        await AuditLogger.write({
            submissionId: `admin:plan:${data.planId}`,
            tenantId: 'system',
            event: AuditEventTypes.PLAN_CREATED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                planId: data.planId,
                planName: data.name,
            },
        });

        return createdPlan;
    }

    public async updatePlan(planId: string, data: Partial<IAdminPlanInput>, loggedInUser: IJWTPayload) {
        const existingPlan = await PlansRepository.getInstance().GetOneByParam<IPlan>(
            { param: 'planId', value: planId },
            ['_id', 'planId']
        );

        if (!existingPlan?._id) {
            throw new CustomError(HttpStatusCode.NotFound, 'Plan not found');
        }

        const updatedPlan = await PlansRepository.getInstance().Update(
            new ObjectId(existingPlan._id),
            {
                ...data,
                updatedAt: Utils.getCurrentDate(),
                updatedBy: loggedInUser.id,
            },
            adminPlanResponseFields,
        ) as IPlan;

        await AuditLogger.write({
            submissionId: `admin:plan:${planId}`,
            tenantId: 'system',
            event: AuditEventTypes.PLAN_UPDATED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                planId,
                planName: data.name || updatedPlan?.name,
            },
        });

        return updatedPlan;
    }

    public async listBilling(data: IAdminBillingQuery, loggedInUser: IJWTPayload) {
        const snapshots = await this.loadSnapshots();
        const searchText = (data.searchText || '').trim().toLowerCase();
        const statusFilter = (data.status || '').trim().toLowerCase();

        const rows = snapshots
            .map((snapshot) => this.buildBillingRow(snapshot))
            .filter((row) => {
                const matchesSearch = !searchText
                    || row.companyName.toLowerCase().includes(searchText)
                    || row.adminEmail.toLowerCase().includes(searchText)
                    || row.planType.toLowerCase().includes(searchText)
                    || row.tenantId.toLowerCase().includes(searchText);
                const matchesStatus = !statusFilter || String(row.subscriptionStatus || '').toLowerCase() === statusFilter || String(row.paymentStatus || '').toLowerCase() === statusFilter;
                return matchesSearch && matchesStatus;
            });

        const totalRevenue = snapshots.reduce((sum, snapshot) => {
            const transaction = snapshot.latestTransaction;
            if (transaction?.status === PaymentStatus.SUCCEEDED) {
                return sum + (transaction.amount || 0);
            }
            return sum;
        }, 0);

        const summary = {
            totalRevenue,
            activeSubscriptions: rows.filter((row) => row.subscriptionStatus === SubscriptionStatus.ACTIVE).length,
            trialSubscriptions: rows.filter((row) => row.subscriptionStatus === SubscriptionStatus.TRIALING).length,
            pastDueSubscriptions: rows.filter((row) => row.subscriptionStatus === SubscriptionStatus.PAST_DUE).length,
            failedPayments: rows.filter((row) => row.paymentStatus === PaymentStatus.FAILED).length,
        };

        const currentPage = Math.max(parseInt(String(data.continuationToken || '1'), 10) || 1, 1);
        const pageSize = Math.max(parseInt(String(data.pageSize || '10'), 10) || 10, 1);
        const total = rows.length;
        const start = (currentPage - 1) * pageSize;
        const paginatedRows = rows.slice(start, start + pageSize);
        const lastPage = start + pageSize >= total;

        return {
            billing: paginatedRows,
            summary,
            pagination: {
                lastPage,
                firstPage: 1,
                count: paginatedRows.length,
                continuationToken: lastPage ? null : String(currentPage + 1),
                total,
            },
        };
    }

    public async listUsers(data: IAdminUsersQuery, loggedInUser: IJWTPayload) {
        const snapshots = await this.loadSnapshots(data.tenantId ? [data.tenantId] : undefined);
        const searchText = (data.searchText || '').trim().toLowerCase();
        const statusFilter = (data.status || '').trim().toLowerCase();

        const users: IAdminUserRow[] = [];
        const seatSummary = snapshots.map((snapshot) => this.buildTenantSummary(snapshot));

        for (const snapshot of snapshots) {
            for (const user of snapshot.totalUsers) {
                const row = this.buildUserRow(snapshot, user);
                const matchesSearch = !searchText
                    || row.name.toLowerCase().includes(searchText)
                    || row.email.toLowerCase().includes(searchText)
                    || row.tenantName.toLowerCase().includes(searchText)
                    || row.role.toLowerCase().includes(searchText);
                const matchesStatus = !statusFilter || row.status.toLowerCase() === statusFilter;
                if (matchesSearch && matchesStatus) {
                    users.push(row);
                }
            }
        }

        const currentPage = Math.max(parseInt(String(data.continuationToken || '1'), 10) || 1, 1);
        const pageSize = Math.max(parseInt(String(data.pageSize || '10'), 10) || 10, 1);
        const total = users.length;
        const start = (currentPage - 1) * pageSize;
        const paginatedRows = users.slice(start, start + pageSize);
        const lastPage = start + pageSize >= total;

        return {
            users: paginatedRows,
            seatSummary,
            pagination: {
                lastPage,
                firstPage: 1,
                count: paginatedRows.length,
                continuationToken: lastPage ? null : String(currentPage + 1),
                total,
            },
        };
    }

    public async forceLogoutUser(userId: string, loggedInUser: IJWTPayload) {
        const user = await UsersRepository.getInstance().GetById<IUsers>(userId, ['_id', 'email', 'tenantId', 'username']);

        if (!user?._id) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        await TokenManager.revokeAllUserTokens(userId);

        await AuditLogger.write({
            submissionId: `admin:user:${userId}`,
            tenantId: user.tenantId,
            event: AuditEventTypes.USER_FORCE_LOGGED_OUT,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                userId,
                email: user.email,
            },
        });

        return {
            userId,
            tenantId: user.tenantId,
            message: 'User sessions revoked successfully',
        };
    }

    public async resetPassword(userId: string, loggedInUser: IJWTPayload) {
        const user = await UsersRepository.getInstance().GetById<IUsers>(userId, ['_id', 'email', 'firstName', 'lastName', 'username', 'tenantId', 'role']);

        if (!user?._id) {
            throw new CustomError(HttpStatusCode.NotFound, 'User not found');
        }

        const otp = await OtpService.createOtp(user._id.toString(), user.email, 'password_reset');
        await Utils.sendMail(
            user.email,
            EmailTemplateTypes.FORGOT_PASSWORD,
            {
                firstName: user.firstName || user.username || 'there',
                otp,
            },
            'Password Reset Request',
        );

        await AuditLogger.write({
            submissionId: `admin:user:${userId}`,
            tenantId: user.tenantId,
            event: AuditEventTypes.PASSWORD_RESET_REQUESTED,
            actor: {
                type: 'user',
                id: loggedInUser.id,
                name: loggedInUser.username,
            },
            metadata: {
                userId,
                email: user.email,
            },
        });

        return {
            userId,
            tenantId: user.tenantId,
            message: 'Password reset email sent successfully',
        };
    }
}

export default AdminService.getInstance();
