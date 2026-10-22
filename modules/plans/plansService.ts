import { HttpStatusCode } from 'axios';
import { PlansRepository } from './plansRepository';
import { IPlan, optimizedPlanResponseFields } from './plansInterface';
import { CustomError } from '../../core/errors/custom';
import QueryOperators from '../../core/enums/queryOperators';

class PlansService {
    private static instance: PlansService;
    private plansRepository: PlansRepository;

    private constructor() {
        this.plansRepository = PlansRepository.getInstance();
    }

    public static getInstance(): PlansService {
        if (!PlansService.instance) {
            PlansService.instance = new PlansService();
        }
        return PlansService.instance;
    }

    //* -------------------------------------------------------------------------- */
    //*                            LIST ALL PLANS                                  */
    //* -------------------------------------------------------------------------- */
    public async listPlans(): Promise<IPlan[]> {
        return await this.plansRepository.GetAll(
            [
                { param: 'isActive', value: true, operator: QueryOperators.AND },
                { param: 'isPublic', value: true, operator: QueryOperators.AND },
            ],
            false,
            0,
            100,
            { displayOrder: 1 },
            optimizedPlanResponseFields
        ) as IPlan[];
    }

    //* -------------------------------------------------------------------------- */
    //*                         GET PLAN BY PLAN ID                                */
    //* -------------------------------------------------------------------------- */
    public async getPlanByPlanId(planId: string): Promise<IPlan> {
        const plan = await this.plansRepository.GetOneByParams(
            [{ param: 'planId', value: planId, operator: QueryOperators.AND }],
            optimizedPlanResponseFields
        ) as IPlan;

        if (!plan) {
            throw new CustomError(HttpStatusCode.NotFound, 'Plan not found');
        }

        return plan;
    }
}

export default PlansService;
