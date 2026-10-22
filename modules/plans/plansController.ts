import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import PlansService from './plansService';
import { Utils } from '../../utils/utils';
import { planIdSchema } from './plansValidation';
import { validateRequestParamsViaMiddleware } from '../../core/validators/globalValidators';

const router = express.Router();
const service = PlansService.getInstance();

/*
 * GET /api/v1/plans
 * List all public active plans (unpaginated)
 */
router.get('/', async (req: Request, res: Response) => {
    const plans = await service.listPlans();

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Plans retrieved successfully',
        data: plans
    });
});

/*
 * GET /api/v1/plans/:planId
 * Get a single plan by planId
 */
router.get('/:planId', validateRequestParamsViaMiddleware(planIdSchema), async (req: Request, res: Response) => {
    const { planId } = req.validatedParams;
    const plan = await service.getPlanByPlanId(planId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Plan retrieved successfully',
        data: plan
    });
});

export default router;
