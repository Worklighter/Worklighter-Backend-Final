import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS, PAGE, PER_PAGE } from "../../utils/constants";
import { Utils } from "../../utils/utils";
import StatusTypes from "../../core/enums/statusTypes";
import { IJob, IJobStatistics, IListJobsResponse, jobResponseFields } from "./jobsInterface";

class JobsRepository extends BaseRepository {
    private static instance: JobsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.JOBS, []);
    }

    public static getInstance(): JobsRepository {
        if (!JobsRepository.instance) {
            JobsRepository.instance = new JobsRepository();
        }
        return JobsRepository.instance;
    }

    public async INIT(): Promise<void> {
        await super.INIT();
    }

    public async listJobs(params: {
        tenantId: string;
        status?: 'all' | StatusTypes.JOB_ACTIVE | StatusTypes.JOB_INACTIVE;
        searchText?: string;
        continuationToken?: number;
        pageSize?: number;
    }): Promise<IListJobsResponse> {
        const currentPage = params.continuationToken || PAGE;
        const pageSize = params.pageSize || PER_PAGE;
        const { skip, limit } = Utils.CalcPagination(currentPage, pageSize);

        const matchConditions: Record<string, any> = {
            tenantId: params.tenantId,
            deletedAt: null,
        };

        if (params.status && params.status !== 'all') {
            matchConditions.status = params.status;
        }

        if (params.searchText) {
            matchConditions.$or = [
                { jobName: { $regex: params.searchText, $options: 'i' } },
                { jobNumber: { $regex: params.searchText, $options: 'i' } },
                { city: { $regex: params.searchText, $options: 'i' } },
                { state: { $regex: params.searchText, $options: 'i' } },
            ];
        }

        const projection = this.constructProjection(jobResponseFields);

        // Statistics always count all jobs for the tenant, ignoring status/search filters
        const statsMatch: Record<string, any> = { tenantId: params.tenantId, deletedAt: null };

        const [result] = await this.customAggregator([
            {
                $facet: {
                    statistics: [
                        { $match: statsMatch },
                        {
                            $group: {
                                _id: null,
                                totalJobs: { $sum: 1 },
                                activeJobs: { $sum: { $cond: [{ $eq: ['$status', StatusTypes.JOB_ACTIVE] }, 1, 0] } },
                                inactiveJobs: { $sum: { $cond: [{ $eq: ['$status', StatusTypes.JOB_INACTIVE] }, 1, 0] } },
                            },
                        },
                    ],
                    jobs: [
                        { $match: matchConditions },
                        { $sort: { createdAt: -1 } },
                        { $skip: skip },
                        { $limit: limit + 1 },
                        { $project: projection },
                    ],
                },
            },
        ]);

        const statsDoc = result?.statistics?.[0];
        const statistics: IJobStatistics = statsDoc
            ? { totalJobs: statsDoc.totalJobs, activeJobs: statsDoc.activeJobs, inactiveJobs: statsDoc.inactiveJobs }
            : { totalJobs: 0, activeJobs: 0, inactiveJobs: 0 };

        const jobs: IJob[] = result?.jobs ?? [];
        let newContinuationToken: string | null = null;

        if (jobs.length > pageSize) {
            jobs.pop();
            newContinuationToken = `${currentPage + 1}`;
        }

        return { statistics, jobs, continuationToken: newContinuationToken };
    }
}

export default JobsRepository;