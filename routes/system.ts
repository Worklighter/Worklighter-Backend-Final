import express from 'express'
const routes = express.Router();
import SystemRoutes from '../modules/system/systemController'
import { wrapRoutesWithAsyncHandler } from '../utils/helpers/asyncHandler';
import EmailSubmissionsRoutes from "../modules/emailSubmissions/emailSubmissionsController";


routes.use('/insights', wrapRoutesWithAsyncHandler(SystemRoutes));
routes.use('/credit-card', wrapRoutesWithAsyncHandler(SystemRoutes));

export const router = routes;