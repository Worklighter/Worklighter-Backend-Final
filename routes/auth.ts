import express from 'express'
const routes = express.Router();

import { wrapRoutesWithAsyncHandler } from '../utils/helpers/asyncHandler';

import AuthRoutes from '../modules/auth/authController'
import CallbackRoutes from '../modules/callbacks/callbacksController'


routes.use('/v1', wrapRoutesWithAsyncHandler(AuthRoutes));
routes.use('/callbacks', wrapRoutesWithAsyncHandler(CallbackRoutes));



export const router = routes;