import express from 'express'
const routes = express.Router();
import { wrapRoutesWithAsyncHandler } from '../utils/helpers/asyncHandler';
import UsersRoutes from '../modules/users/usersController'
import RolesRoutes from '../modules/roles/rolesController'
import EmailsRoutes from '../modules/emails/emailsController'
import EmailSubmissionsRoutes from '../modules/emailSubmissions/emailSubmissionsController'
import JobsRoutes from '../modules/jobs/jobsController';
import CostCodesRoutes from '../modules/costCodes/costCodesController'
import WCCodesRoutes from '../modules/wcCodes/wcCodesController'
import PlanRoutes from '../modules/plans/plansController'
import CoiAlertsRoutes from '../modules/coiAlerts/coiAlertsController';
import CoiConfigsRoutes from '../modules/coiConfigs/coiConfigsController';
import CompanyRoutes from '../modules/company/companyController'
import KnowledgeBaseRoutes from '../modules/knowledgeBase/knowledgeBaseController'
import SubscriptionsRoutes from '../modules/subscriptions/subscriptionsController'
import AdminRoutes from './admin'




routes.use('/v1/users', wrapRoutesWithAsyncHandler(UsersRoutes));
routes.use('/v1/roles', wrapRoutesWithAsyncHandler(RolesRoutes));
routes.use('/v1/emails', wrapRoutesWithAsyncHandler(EmailsRoutes));
routes.use('/v1/email-submissions', wrapRoutesWithAsyncHandler(EmailSubmissionsRoutes));
routes.use('/v1/jobs', wrapRoutesWithAsyncHandler(JobsRoutes));
routes.use('/v1/cost-codes', wrapRoutesWithAsyncHandler(CostCodesRoutes));
routes.use('/v1/wc-codes', wrapRoutesWithAsyncHandler(WCCodesRoutes));
routes.use('/v1/coi-vendors',  wrapRoutesWithAsyncHandler(CoiAlertsRoutes));
routes.use('/v1/coi-alerts',  wrapRoutesWithAsyncHandler(CoiConfigsRoutes));
routes.use('/v1/company', wrapRoutesWithAsyncHandler(CompanyRoutes));
routes.use('/v1/knowledge-base', wrapRoutesWithAsyncHandler(KnowledgeBaseRoutes));

routes.use('/v1/dashboard', wrapRoutesWithAsyncHandler(UsersRoutes));
routes.use('/v1/plans', wrapRoutesWithAsyncHandler(PlanRoutes));
routes.use('/v1/subscriptions', wrapRoutesWithAsyncHandler(SubscriptionsRoutes));
routes.use('/v1/admin', wrapRoutesWithAsyncHandler(AdminRoutes));
export const router = routes;
