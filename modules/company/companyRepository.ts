import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";


class OnboardingRepository extends BaseRepository {
    private static instance: OnboardingRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.ONBOARDING, []);
    }

    public static getInstance(): OnboardingRepository {
        if (!OnboardingRepository.instance) {
            OnboardingRepository.instance = new OnboardingRepository();
        }
        return OnboardingRepository.instance;
    }

    public async INIT(): Promise<void> {
        await super.INIT();
    }


    //* -------------------------------------------------------------------------- */
    //*                    GET REVIEW QUEUE BY EMAIL METHOD                        */
    //* -------------------------------------------------------------------------- */
    public async getTenantByEmail(recipientEmail: string): Promise<{ tenantId: string; connectedWorkflows: string[] } | null> {
        const normalizedRecipientEmail = (recipientEmail || '').trim().toLowerCase();
        const pipeline = [
            {
                $match: {
                    deletedAt: null,
                    $expr: {
                        $eq: [
                            { $toLower: { $trim: { input: { $ifNull: ['$assignedEmail', ''] } } } },
                            normalizedRecipientEmail
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    tenantId: 1,
                    connectedWorkflows: {
                        $map: {
                            input: {
                                $filter: {
                                    input: { $ifNull: ['$selectedWorkflows', []] },
                                    as: 'wf',
                                    cond: { $eq: ['$$wf.connected', true] }
                                }
                            },
                            as: 'wf',
                            in: '$$wf.workflowName'
                        }
                    }
                }
            },
            {
                $limit: 1
            }
        ];

        const result = await this.collection.aggregate(pipeline).toArray();
        return result.length > 0 ? (result[0] as { tenantId: string; connectedWorkflows: string[] }) : null;
    }


    //* -------------------------------------------------------------------------- */
    //*                     GET OWNER ID BY TENANT ID METHOD                       */
    //* -------------------------------------------------------------------------- */
    public async getOwnerIdByTenantId(tenantId: string): Promise<string | null> {
        const result = await this.collection.findOne(
            { tenantId, deletedAt: null },
            { projection: { ownerId: 1 } }
        );

        return result?.ownerId || null;
    }
}

export default OnboardingRepository;
