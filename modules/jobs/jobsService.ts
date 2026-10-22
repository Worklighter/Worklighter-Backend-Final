import { ObjectId } from "mongodb";
import { HttpStatusCode } from "axios";
import { CustomError } from "../../core/errors/custom";
import { Utils } from "../../utils/utils";
import IJWTPayload from "../../core/interfaces/jwt";
import QueryOperators from "../../core/enums/queryOperators";
import StatusTypes from "../../core/enums/statusTypes";
import JobsModel from "./jobsModel";
import JobsRepository from "./jobsRepository";
import {
    IJob,
    ICreateJobDTO,
    IUpdateJobDTO,
    IListJobsDTO,
    IListJobsResponse,
    jobResponseFields
} from "./jobsInterface";
import OnboardingRepository from "../company/companyRepository";
import { ICompany } from "../company/companyInterface";
import AzureJobsSearch from "../../integration/azure/jobsSearch";
import { Logger } from "../../utils/helpers/logger";

class JobsService {

    /**
     * Auto-populate Job Address
     */
    private autoPopulateAddress(city: string, state: string, zipCode: string): string {
        return `${city}, ${state} ${zipCode}`;
    }

    /**
     * Create Job
     */
    public async createJob(data: ICreateJobDTO, loggedInUser: IJWTPayload): Promise<IJob> {
        const jobNumber = data.jobNumber?.trim() || null;

        if (jobNumber) {
            const existingJob = await JobsRepository.getInstance().GetOneByParams(
                [
                    { param: 'jobNumber', value: jobNumber, operator: QueryOperators.AND },
                    { param: 'deletedAt', value: null, operator: QueryOperators.AND }
                ],
                ['_id']
            );

            if (existingJob) {
                throw new CustomError(HttpStatusCode.Conflict, 'Job number already exists');
            }
        }

        // Auto-populate job address only when all location fields are present
        let jobAddress = data.jobAddress?.trim() || null;
        if (!jobAddress && data.city && data.state && data.zipCode) {
            jobAddress = this.autoPopulateAddress(data.city, data.state, data.zipCode);
        }

        // Add user's email as first recipient if arrays are empty
        const userEmail = loggedInUser.email;
        const invoiceRecipients = data.invoiceRecipients && data.invoiceRecipients.length > 0 
            ? data.invoiceRecipients 
            : [userEmail];
        const dailyLogRecipients = data.dailyLogRecipients && data.dailyLogRecipients.length > 0 
            ? data.dailyLogRecipients 
            : [userEmail];

        const onboarding: ICompany | null = await OnboardingRepository.getInstance().GetOneByParams([
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
            ], ['_id']);

        const jobData: Partial<IJob> = {
            companyId: onboarding?._id || null,
            jobName: data.jobName,
            jobNumber: jobNumber,
            status: data.status || StatusTypes.JOB_ACTIVE,
            jobAddress: jobAddress || undefined,
            city: data.city || undefined,
            state: data.state || undefined,
            zipCode: data.zipCode || undefined,
            invoiceRecipients: invoiceRecipients,
            invoiceCcRecipients: data.invoiceCcRecipients || [],
            includeInvoiceSubmitter: data.includeInvoiceSubmitter !== undefined ? data.includeInvoiceSubmitter : true,
            dailyLogRecipients: dailyLogRecipients,
            dailyLogCcRecipients: data.dailyLogCcRecipients || [],
            includeDailyLogSubmitter: data.includeDailyLogSubmitter !== undefined ? data.includeDailyLogSubmitter : true,
            tenantId: loggedInUser.tenantId,
            createdBy: loggedInUser.id,
            createdAt: Utils.getCurrentDate()
        };

        const jobModel = JobsModel.create(jobData);
        const createdJob = await JobsRepository.getInstance().Add(jobModel, jobResponseFields) as IJob;

        // Index in Azure AI Search for job attribution (non-blocking — failure must not fail job creation)
        AzureJobsSearch.getInstance()
            .indexJob(createdJob._id.toString(), createdJob.jobName, createdJob.jobNumber, loggedInUser.tenantId)
            .catch(err => Logger.Console(`Jobs vector index failed for job ${createdJob._id}: ${err?.message}`, 'warn'));

        return createdJob;
    }

    /**
     * List Jobs with Statistics
     */
    public async listJobs(data: IListJobsDTO, loggedInUser: IJWTPayload): Promise<IListJobsResponse> {
        return JobsRepository.getInstance().listJobs({
            tenantId: loggedInUser.tenantId,
            status: data.status,
            searchText: data.searchText,
            continuationToken: data.continuationToken,
            pageSize: data.pageSize,
        });
    }

    /**
     * Get Single Job
     */
    public async getJob(jobId: string, loggedInUser: IJWTPayload): Promise<IJob> {
        const job = await JobsRepository.getInstance().GetById<IJob>(jobId, jobResponseFields);

        if (!job) {
            throw new CustomError(HttpStatusCode.NotFound, 'Job not found');
        }

        if (job.tenantId !== loggedInUser.tenantId) {
            throw new CustomError(HttpStatusCode.Forbidden, 'Access denied');
        }

        return job;
    }

    /**
     * Update Job
     */
    public async updateJob(data: IUpdateJobDTO, loggedInUser: IJWTPayload): Promise<IJob> {
        const { jobId, ...updateData } = data;

        // Check if job exists
        const existingJob = await JobsRepository.getInstance().GetOneByParams(
            [
                { param: '_id', value: new ObjectId(jobId), operator: QueryOperators.AND },
                { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
                { param: 'deletedAt', value: null, operator: QueryOperators.AND }
            ],
            ['_id', 'jobNumber', 'city', 'state', 'zipCode']
        ) as IJob | null;

        if (!existingJob) {
            throw new CustomError(HttpStatusCode.NotFound, 'Job not found');
        }

        // If job number is being updated, check uniqueness
        if (updateData.jobNumber && updateData.jobNumber !== existingJob.jobNumber) {
            const duplicateJob = await JobsRepository.getInstance().GetOneByParams(
                [
                    { param: 'jobNumber', value: updateData.jobNumber, operator: QueryOperators.AND },
                    { param: 'deletedAt', value: null, operator: QueryOperators.AND }
                ],
                ['_id']
            );

            if (duplicateJob) {
                throw new CustomError(HttpStatusCode.Conflict, 'Job number already exists');
            }
        }

        // Auto-populate address if city, state, or zipCode changed but address not provided
        if ((updateData.city || updateData.state || updateData.zipCode) && !updateData.jobAddress) {
            const city = updateData.city || existingJob.city;
            const state = updateData.state || existingJob.state;
            const zipCode = updateData.zipCode || existingJob.zipCode;
            updateData.jobAddress = this.autoPopulateAddress(city, state, zipCode);
        }

        // Update job
        const updatedJob = await JobsRepository.getInstance().Update(
            new ObjectId(jobId),
            {
                ...updateData,
                updatedBy: loggedInUser.id,
                updatedAt: Utils.getCurrentDate()
            },
            jobResponseFields
        );

        if (!updatedJob) {
            throw new CustomError(HttpStatusCode.InternalServerError, 'Failed to update job');
        }

        return updatedJob as IJob;
    }

    /**
     * Soft Delete Job
     */
    public async deleteJob(jobId: string, loggedInUser: IJWTPayload): Promise<void> {
        const existingJob = await JobsRepository.getInstance().GetOneByParams(
            [
                { param: '_id', value: new ObjectId(jobId), operator: QueryOperators.AND },
                { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
                { param: 'deletedAt', value: null, operator: QueryOperators.AND }
            ],
            ['_id']
        );

        if (!existingJob) {
            throw new CustomError(HttpStatusCode.NotFound, 'Job not found');
        }

        await JobsRepository.getInstance().Update(
            new ObjectId(jobId),
            {
                deletedAt: Utils.getCurrentDate()
            },
            []
        );

        // Remove from vector index (non-blocking)
        AzureJobsSearch.getInstance()
            .deleteJob(jobId)
            .catch(err => Logger.Console(`Jobs vector delete failed for job ${jobId}: ${err?.message}`, 'warn'));
    }
}

export default new JobsService();
