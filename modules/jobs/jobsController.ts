import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import { Utils } from '../../utils/utils';
import JobsService from './jobsService';
import { ICreateJobDTO, IUpdateJobDTO, IListJobsDTO } from './jobsInterface';
import {
    createJobValidator,
    updateJobParamsValidator,
    updateJobBodyValidator,
    listJobsValidator,
    getJobParamsValidator,
} from './jobsValidator';

const routes = express.Router();

/*
 * POST /api/v1/jobs
 * Create a new job
 */
routes.post( '', authMiddleware, requireActiveSubscription, validateRequestBodyViaMiddleware(createJobValidator), async (req: Request, res: Response) => {
        const data: ICreateJobDTO = req.validatedBody;
        const result = await JobsService.createJob(data, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Created,
            status: true,
            responseCode: '201',
            responseDescription: 'Job created successfully',
            data: result
        });
    }
);

/*
 * GET /api/v1/jobs
 * List all jobs with statistics
 */
routes.get( '', authMiddleware, requireActiveSubscription, validateRequestQueryViaMiddleware(listJobsValidator),
    async (req: Request, res: Response) => {
        const data: IListJobsDTO = {
            searchText: req.validatedQuery?.searchText || null,
            status: req.validatedQuery?.status,
            continuationToken: req.validatedQuery?.continuationToken,
            pageSize: req.validatedQuery?.pageSize,
        };

        const result = await JobsService.listJobs(data, req.user);
        const paginatedJobs = Utils.pagination(!result.continuationToken, result.jobs, result.continuationToken);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: result.jobs.length ? 'Jobs retrieved successfully' : 'No jobs found',
            data: {
                statistics: result.statistics,
                ...paginatedJobs
            }
        });
    }
);

/*
 * GET /api/v1/jobs/:jobId
 * Get single job by ID
 */
routes.get( '/:jobId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(getJobParamsValidator),
    async (req: Request, res: Response) => {
        const jobId = req.validatedParams.jobId;
        const result = await JobsService.getJob(jobId, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Job retrieved successfully',
            data: result
        });
    }
);

/*
 * PUT /api/v1/jobs/:jobId
 * Update job
 */
routes.patch( '/:jobId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(updateJobParamsValidator),
    validateRequestBodyViaMiddleware(updateJobBodyValidator),
    async (req: Request, res: Response) => {
        const data: IUpdateJobDTO = {
            jobId: req.validatedParams.jobId,
            ...req.validatedBody
        };

        const result = await JobsService.updateJob(data, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Job updated successfully',
            data: result
        });
    }
);


/*
 * DELETE /api/v1/jobs/:jobId
 * Soft delete job
 */
routes.delete( '/:jobId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(getJobParamsValidator),
    async (req: Request, res: Response) => {
        const jobId = req.validatedParams.jobId;
        await JobsService.deleteJob(jobId, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Job deleted successfully'
        });
    }
);

export default routes;
