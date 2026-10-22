import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../../utils/utils';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireSuperAdmin from '../../middlewares/requireSuperAdmin';
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import AdminService from './adminService';
import {
    adminPlanCreateSchema,
    adminPlanUpdateSchema,
    adminTenantQuerySchema,
    adminTenantStatusSchema,
    adminUserQuerySchema,
} from './adminInterface';

const routes = express.Router();

const normalizeParam = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
};

routes.get('/tenants', authMiddleware, requireSuperAdmin, validateRequestQueryViaMiddleware(adminTenantQuerySchema), async (req: Request, res: Response) => {
    const result = await AdminService.listTenants(req.validatedQuery, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Tenants fetched successfully',
        data: result,
    });
});

routes.get('/tenants/:tenantId', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const tenantId = String(normalizeParam(req.params.tenantId) || '');
    const result = await AdminService.getTenantDetail(tenantId, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Tenant fetched successfully',
        data: result,
    });
});

routes.patch('/tenants/:tenantId/status', authMiddleware, requireSuperAdmin, validateRequestBodyViaMiddleware(adminTenantStatusSchema), async (req: Request, res: Response) => {
    const tenantId = String(normalizeParam(req.params.tenantId) || '');
    const result = await AdminService.updateTenantStatus(tenantId, req.validatedBody, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Tenant status updated successfully',
        data: result,
    });
});

routes.post('/tenants/:tenantId/subscription/terminate', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const tenantId = String(normalizeParam(req.params.tenantId) || '');
    const result = await AdminService.terminateSubscription(tenantId, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Subscription terminated successfully',
        data: result,
    });
});

routes.post('/tenants/:tenantId/impersonate', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const tenantId = String(normalizeParam(req.params.tenantId) || '');
    const result = await AdminService.impersonateTenant(tenantId, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Impersonation session created successfully',
        data: result,
    });
});

routes.get('/plans', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const result = await AdminService.listPlans();
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Plans fetched successfully',
        data: result,
    });
});

routes.post('/plans', authMiddleware, requireSuperAdmin, validateRequestBodyViaMiddleware(adminPlanCreateSchema), async (req: Request, res: Response) => {
    const result = await AdminService.createPlan(req.validatedBody, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'Plan created successfully',
        data: result,
    });
});

routes.patch('/plans/:planId', authMiddleware, requireSuperAdmin, validateRequestBodyViaMiddleware(adminPlanUpdateSchema), async (req: Request, res: Response) => {
    const planId = String(normalizeParam(req.params.planId) || '');
    const result = await AdminService.updatePlan(planId, req.validatedBody, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Plan updated successfully',
        data: result,
    });
});

routes.get('/billing', authMiddleware, requireSuperAdmin, validateRequestQueryViaMiddleware(adminUserQuerySchema), async (req: Request, res: Response) => {
    const result = await AdminService.listBilling(req.validatedQuery, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Billing records fetched successfully',
        data: result,
    });
});

routes.get('/users', authMiddleware, requireSuperAdmin, validateRequestQueryViaMiddleware(adminUserQuerySchema), async (req: Request, res: Response) => {
    const result = await AdminService.listUsers(req.validatedQuery, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Users fetched successfully',
        data: result,
    });
});

routes.post('/users/:userId/force-logout', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const userId = String(normalizeParam(req.params.userId) || '');
    const result = await AdminService.forceLogoutUser(userId, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'User sessions revoked successfully',
        data: result,
    });
});

routes.post('/users/:userId/reset-password', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
    const userId = String(normalizeParam(req.params.userId) || '');
    const result = await AdminService.resetPassword(userId, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Password reset email sent successfully',
        data: result,
    });
});

export default routes;
