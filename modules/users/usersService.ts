import { HttpStatusCode } from "axios";
import QueryOperators from "../../core/enums/queryOperators";
import UserRoles from "../../core/enums/userRoles";
import { Utils } from "../../utils/utils";
import SecurityManager from "../../utils/helpers/securityManager";
import JwtTypes from "../../core/enums/jwtTypes";
import StatusTypes from "../../core/enums/statusTypes";
import { ObjectId } from "mongodb";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
import { IUsers, optimizedUserResponseFields, IUpdateUserDTO, listUsersResponseFields, IListUsersDTO, profileResponseFields, IUpdateProfileDTO, ITeamMemberResponse, IInviteTeamMemberDTO, IUpdateTeamMemberDTO } from "./usersInterface";
import { IGetOnCompanyDashboardDTO, IGetCompanyBillingDTO, ICompany, ITeamMember } from "../company/companyInterface";
import UsersRepository from "./usersRepository";
import OnboardingRepository from "../company/companyRepository";
import QueryOperationTypes from "../../core/enums/queryOperationTypes";
import PlanTypes from "../../core/enums/planTypes";
import CompanyService from "../company/companyService";
import EmailTemplatesService from "../emailTemplates/emailTemplatesService";
import TokenManager from "../../utils/helpers/tokenManager";
import { JWT_CONFIGURATION } from "../../utils/constants";




class UsersService {

    /*
    * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    * â•‘          PROTECTED METHODS           â•‘
    * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    */

    protected attachMetaData(data: Partial<IUsers>, loggedInUser: IJWTPayload) {
        data.accountStatus = StatusTypes.ACTIVE;
        data.createdAt = Utils.getCurrentDate();
        data.createdBy = loggedInUser.id;
        // Removed isActive field
    }


    /*
   * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
   * â•‘          PUBLIC METHODS           â•‘
   * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    */



    //* -------------------------------------------------------------------------- */
    //*                                 LIST USERS                                 */
    //* -------------------------------------------------------------------------- */
    public async listUsers(data: IListUsersDTO, loggedInUser: IJWTPayload) {
        const columnsToRetrieve = data.fields ? data.fields.split(',') : listUsersResponseFields;
        const projection: Record<string, number> = {};
        columnsToRetrieve.forEach((field) => {
            projection[field.trim()] = 1;
        });
        const pipeline = [
            {
                $match: {
                    role: { $ne: UserRoles.ADMIN },
                    email: { $ne: loggedInUser.email },
                    deletedAt: null,
                    ...(data.searchText ? { $or: [{ username: { $regex: data.searchText, $options: 'i' } }, { email: { $regex: data.searchText, $options: 'i' } }] } : {}),
                    ...(loggedInUser.role !== UserRoles.ADMIN ? { tenantId: loggedInUser.tenantId } : {}),
                    ...(loggedInUser.role !== UserRoles.ADMIN ? { tenantId: loggedInUser.tenantId } : {}),
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $project: projection
            }
        ];

        const result = await UsersRepository.getInstance().customAggregator(pipeline);

        return { users: result };
    }



    //* -------------------------------------------------------------------------- */
    //*                                 UPDATE USER                                */
    //* -------------------------------------------------------------------------- */
    public async updateUser(data: IUpdateUserDTO, loggedInUser: IJWTPayload) {
        const { userId, ...userDetails } = data;
        const getUserConditions: any = [
            {
                param: '_id',
                value: new ObjectId(userId),
                operator: QueryOperators.AND
            },
            ...(loggedInUser.role === UserRoles.ADMIN ? [] : [
                {
                    param: 'tenantId',
                    value: loggedInUser.tenantId,
                    operator: QueryOperators.AND
                },
                {
                    param: 'role',
                    value: { $ne: UserRoles.ADMIN },
                    operator: QueryOperators.AND
                },
                {
                    param: '_id',
                    value: { $ne: new ObjectId(loggedInUser.id) },
                    operator: QueryOperators.AND
                }
            ])
        ];
        const user: Partial<IUsers> = await UsersRepository.getInstance().GetOneByParams(getUserConditions, ['_id']);
        if (!user) throw new CustomError(HttpStatusCode.NotFound, 'User not found');

        if (userDetails.accountStatus === StatusTypes.DELETED) {
            userDetails['deletedAt'] = Utils.getCurrentDate();
            // Removed isActive field
        }

        const userUpdatedDetails = await UsersRepository.getInstance().Update(new ObjectId(userId), userDetails, listUsersResponseFields);

        if (userDetails.accountStatus !== StatusTypes.DELETED) return userUpdatedDetails;

        return null;
    }




    public async validateUserAccount(email: string, requestedColumns: string[] = [], throwError: boolean = false): Promise<IUsers | null> {
        const getUserAccountConditions: any = [
            { param: 'email', value: email, operator: QueryOperators.AND },
            { param: 'accountStatus', value: StatusTypes.ACTIVE, operator: QueryOperators.AND }
        ];

        const columnsToRetrieve = requestedColumns.length ? requestedColumns : [...optimizedUserResponseFields, 'password'];
        const user: IUsers | null = await UsersRepository.getInstance().GetOneByParams(
            getUserAccountConditions,
            columnsToRetrieve
        ) as IUsers | null;

        if (!user && throwError) throw new CustomError(HttpStatusCode.Unauthorized, 'Invalid email or password');
        return user;
    }


    public async issueJwt(user: Partial<IUsers>, jwtType: JwtTypes, options?: { expiresIn?: string | number }) {
        let jwtPayload: IJWTPayload = null;
        let token = null;

        switch (jwtType) {
            case JwtTypes.API:
                jwtPayload = {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    tenantId: user.tenantId,
                    role: user.role,
                    jwtType,
                    ...(user.role !== UserRoles.ADMIN ? { tenantId: user.tenantId } : {})
                };
                const expiresIn = options?.expiresIn ?? JWT_CONFIGURATION.apiAccessTokenExpiration;
                token = await SecurityManager.generateJWT(jwtPayload, jwtType, expiresIn);

                const expiresAt = (() => {
                    if (typeof expiresIn === "number") {
                        return new Date(Date.now() + expiresIn * 1000);
                    }

                    const expiryMatch = /^(\d+)([smhd])$/i.exec(expiresIn);
                    if (!expiryMatch) {
                        return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                    }

                    const value = Number(expiryMatch[1]);
                    const unit = expiryMatch[2].toLowerCase();
                    const multiplierByUnit: Record<string, number> = {
                        s: 1000,
                        m: 60 * 1000,
                        h: 60 * 60 * 1000,
                        d: 24 * 60 * 60 * 1000,
                    };

                    return new Date(Date.now() + value * (multiplierByUnit[unit] ?? multiplierByUnit.d));
                })();

                await TokenManager.issueToken(
                    token,
                    user._id.toString(),
                    user.tenantId,
                    expiresAt
                );
                return {
                    accessToken: token,
                    user: {
                        id: user._id.toString(),
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        username: user.username,
                        role: user.role,
                        tenantId: user.tenantId,
                    }
                };

            case JwtTypes.PASSWORD_RESET:
                jwtPayload = {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    jwtType,
                    ...(user.role !== UserRoles.ADMIN ? { tenantId: user.tenantId } : {})
                };

                token = await SecurityManager.generateJWT(jwtPayload, jwtType, options?.expiresIn);
                const reasonGUID = Utils.UUIDGenerator();
                return { token, reasonGUID };
            default:
                throw new CustomError(HttpStatusCode.BadRequest, 'Invalid jwt type provided');
        }
    }



    public async validatePassword(password: string, passwordHash: string) {
        const isPasswordMatched = await SecurityManager.verifyPassword(password, passwordHash);
        if (!isPasswordMatched) throw new CustomError(HttpStatusCode.Unauthorized, 'Invalid email or password');
    }


    public async updateUserPassword(userId: string, password: string) {
        await UsersRepository.getInstance().Update(new ObjectId(userId), { password })
    }

    /*
   * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
   * â•‘      PROFILE MANAGEMENT METHODS       â•‘
   * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    */

    public async getProfile(loggedInUser: IJWTPayload) {
        const profile: Partial<IUsers> = await UsersRepository.getInstance().GetById(
            loggedInUser.id,
            profileResponseFields
        );

        const companyInfo = await CompanyService.getOnboardingByOwnerId(loggedInUser.id);

        return {
            _id: profile._id.toString(),
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            username: profile.username,
            tenantId: profile.tenantId,
            role: profile.role,
            accountStatus: profile.accountStatus,
            profilePicImage: profile.profilePicImage,
            createdAt: typeof profile.createdAt === 'string'
                ? new Date(profile.createdAt)
                : profile.createdAt,
            verification: profile.isEmailVerified ? 'verified' : 'not verified',
            onboardingStatus: {
                hasCompleted: companyInfo?.isPaymentCompleted || false,
                currentStep: companyInfo?.step || null
            },
            companyInfo: companyInfo || null
        };
    }




    public async updateProfile(
        userId: string,
        data: IUpdateProfileDTO
    ) {
        const existingProfile = await UsersRepository.getInstance().GetById(
            userId,
            ['_id']
        );

        if (!existingProfile) {
            throw new CustomError(HttpStatusCode.NotFound, 'Profile not found');
        }

        const updateData: IUpdateProfileDTO = {};

        if (data.firstName !== undefined) {
            updateData.firstName = data.firstName.trim();
        }

        if (data.lastName !== undefined) {
            updateData.lastName = data.lastName.trim();
        }

        const updatedProfile = await UsersRepository.getInstance().Update(
            new ObjectId(userId),
            {
                ...updateData,
                updatedAt: new Date()
            },
            profileResponseFields
        ) as IUsers;

        if (!updatedProfile) {
            throw new CustomError(HttpStatusCode.InternalServerError, 'Failed to update profile');
        }

        // Get onboarding status
        const onboarding = await CompanyService.getOnboardingByOwnerId(userId);

        return {
            _id: updatedProfile._id.toString(),
            tenantId: updatedProfile.tenantId,
            firstName: updatedProfile.firstName,
            lastName: updatedProfile.lastName,
            email: updatedProfile.email,
            username: updatedProfile.username,
            role: updatedProfile.role,
            accountStatus: updatedProfile.accountStatus,
            profilePicImage: updatedProfile.profilePicImage,
            createdAt: typeof updatedProfile.createdAt === 'string'
                ? new Date(updatedProfile.createdAt)
                : updatedProfile.createdAt,
            verification: updatedProfile.isEmailVerified ? 'verified' : 'not verified',
            onboardingStatus: {
                hasCompleted: onboarding?.isPaymentCompleted || false,
                currentStep: onboarding?.step || null
            },
            onboarding: onboarding || null
        };
    }


    /*
   * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
   * â•‘      TEAM MEMBER MANAGEMENT METHODS   â•‘
   * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    */

    public async getTeamMembers(loggedInUser: IJWTPayload): Promise<ITeamMemberResponse[]> {
        const { tenantId, id: callerId } = loggedInUser;

        const teamMembers = await UsersRepository.getInstance().collection
            .find({
                tenantId,
                _id: { $ne: new ObjectId(callerId) },
            })
            .toArray();

        return teamMembers.map((member: any) => ({
            id: member._id.toString(),
            email: member.email,
            name: `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.fullName || member.email,
            role: member.role,
            status: member.accountStatus === StatusTypes.ACTIVE ? 'Active' : 'Inactive',
            invitedAt: member.createdAt,
            joinedAt: member.emailVerifiedAt || undefined,
        }));
    }

    public async inviteTeamMember(userId: string, data: IInviteTeamMemberDTO): Promise<ITeamMemberResponse> {
        const onboarding = await CompanyService.getOnboardingByOwnerId(userId);

        if (!onboarding) {
            throw new CustomError(HttpStatusCode.NotFound, 'Company not found. Please complete onboarding first.');
        }

        const normalizedInviteEmail = data.email.trim().toLowerCase();
        const inviter = await UsersRepository.getInstance().GetById(userId, ['email']) as IUsers;
        const inviterEmail = inviter?.email?.trim().toLowerCase();

        if (inviterEmail && normalizedInviteEmail === inviterEmail) {
            throw new CustomError(HttpStatusCode.BadRequest, 'You cannot invite yourself as a team member');
        }

        // Check if a user with this email already exists in this tenant
        const existingUser = await UsersRepository.getInstance().GetOneByParams(
            [
                { param: 'email', value: normalizedInviteEmail, operator: QueryOperators.AND },
                { param: 'tenantId', value: onboarding.tenantId, operator: QueryOperators.AND },
            ],
            ['_id']
        ) as IUsers;
        if (existingUser?._id) {
            throw new CustomError(HttpStatusCode.Conflict, 'A team member with this email already exists');
        }

        const nameParts = (data.name || '').trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const newMember: ITeamMember = {
            id: this.generateMemberId(),
            email: normalizedInviteEmail,
            firstName,
            lastName,
            role: data.role,
            invitedAt: Utils.getCurrentDate(),
        };

        const temporaryPassword = Utils.generateRandomPassword();
        await this.upsertInvitedTeamMemberUser(onboarding.tenantId, newMember, temporaryPassword);
        await this.sendTeamMemberInvitation(newMember, onboarding.companyName, temporaryPassword);

        return {
            id: newMember.id!,
            email: newMember.email,
            name: `${newMember.firstName} ${newMember.lastName}`.trim() || newMember.email,
            role: newMember.role,
            status: 'Active',
            invitedAt: newMember.invitedAt,
        };
    }

    public async updateTeamMember(userId: string, memberId: string, data: IUpdateTeamMemberDTO): Promise<ITeamMemberResponse> {
        const onboarding = await CompanyService.getOnboardingByOwnerId(userId);
        if (!onboarding) {
            throw new CustomError(HttpStatusCode.NotFound, 'Company not found. Please complete onboarding first.');
        }

        const usersRepo = UsersRepository.getInstance();
        const member = await usersRepo.GetById(memberId, ['_id', 'email', 'firstName', 'lastName', 'role', 'accountStatus', 'createdAt', 'tenantId']) as IUsers;

        if (!member || member.tenantId !== onboarding.tenantId) {
            throw new CustomError(HttpStatusCode.NotFound, 'Team member not found');
        }

        const updates: Partial<IUsers> = { updatedAt: Utils.getCurrentDate() };

        if (data.name !== undefined) {
            const nameParts = data.name.trim().split(' ');
            updates.firstName = nameParts[0] || '';
            updates.lastName = nameParts.slice(1).join(' ') || '';
            updates.fullName = data.name.trim();
        }
        if (data.role) {
            updates.role = data.role;
        }

        await usersRepo.Update(new ObjectId(memberId), updates);

        const updated = { ...member, ...updates };
        return {
            id: memberId,
            email: updated.email,
            name: `${updated.firstName || ''} ${updated.lastName || ''}`.trim() || updated.email,
            role: updated.role,
            status: updated.accountStatus === StatusTypes.ACTIVE ? 'Active' : 'Inactive',
            invitedAt: updated.createdAt,
        };
    }

    public async removeTeamMember(userId: string, memberId: string): Promise<void> {
        const onboarding = await CompanyService.getOnboardingByOwnerId(userId);
        if (!onboarding) {
            throw new CustomError(HttpStatusCode.NotFound, 'Company not found. Please complete onboarding first.');
        }

        const member = await UsersRepository.getInstance().GetById(memberId, ['_id', 'tenantId']) as IUsers;
        if (!member || member.tenantId !== onboarding.tenantId) {
            throw new CustomError(HttpStatusCode.NotFound, 'Team member not found');
        }

        await UsersRepository.getInstance().Update(
            new ObjectId(memberId),
            { deletedAt: Utils.getCurrentDate(), accountStatus: StatusTypes.INACTIVE, updatedAt: Utils.getCurrentDate() }
        );
    }

    private generateMemberId(): string {
        return new ObjectId().toHexString();
    }

    private async sendTeamMemberInvitation(member: ITeamMember, companyName: string, temporaryPassword: string): Promise<void> {
        try {
            await EmailTemplatesService.sendTeamInvitations(
                [
                    {
                        email: member.email,
                        firstName: member.firstName || 'there',
                        role: member.role,
                        password: temporaryPassword
                    }
                ],
                companyName || 'Worklighter'
            );
        } catch (error) {
            console.error('Failed to send invitation email:', error);
            // Don't throw - we don't want to fail the invite if email fails
        }
    }

    private async upsertInvitedTeamMemberUser(tenantId: string, member: ITeamMember, temporaryPassword: string): Promise<void> {
        const usersRepo = UsersRepository.getInstance();
        const existingUser = await usersRepo.GetOneByParams(
            [
                { param: 'email', value: member.email, operator: QueryOperators.AND },
                { param: 'tenantId', value: tenantId, operator: QueryOperators.AND },
                { param: 'deletedAt', value: null, operator: QueryOperators.AND }
            ],
            ['_id']
        ) as IUsers;

        const passwordHash = await SecurityManager.hashPassword(temporaryPassword);

        if (existingUser?._id) {
            await usersRepo.Update(
                new ObjectId(existingUser._id),
                {
                    firstName: member.firstName,
                    lastName: member.lastName,
                    role: member.role,
                    password: passwordHash,
                    accountStatus: StatusTypes.ACTIVE,
                    updatedAt: Utils.getCurrentDate(),
                    deletedAt: null
                }
            );
            return;
        }

        const username = member.email.split('@')[0];
        await usersRepo.Add({
            tenantId,
            email: member.email,
            firstName: member.firstName,
            lastName: member.lastName,
            role: member.role,
            username,
            fullName: `${member.firstName || ''} ${member.lastName || ''}`.trim(),
            password: passwordHash,
            accountStatus: StatusTypes.ACTIVE,
            emailVerifiedAt: "false",
            isOwner: false,
            createdAt: Utils.getCurrentDate(),
            updatedAt: Utils.getCurrentDate(),
            deletedAt: null
        });
    }


    /*
   * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
   * â•‘          PRIVATE METHODS          â•‘
   * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    */


    private async validateUserEmailUniqueness(parameters: any) {
        const userCount = await UsersRepository.getInstance().Count(parameters);
        if (userCount) throw new CustomError(HttpStatusCode.Conflict, 'A user already exists with the provided email');
    }


    public async getUserByEmail(email: string): Promise<Partial<IUsers> | null> {
        const getUserConditions: any = [
            {
                param: 'email',
                value: email,
                operator: QueryOperators.AND
            },
            {
                param: 'deletedAt',
                value: null,
                operator: QueryOperators.AND
            }
        ];

        const user: Partial<IUsers> | null = await UsersRepository.getInstance().GetOneByParams(getUserConditions, optimizedUserResponseFields);
        return user ?? null;
    }

    /*
 * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
 * â•‘   APPROVAL LIMIT METHOD (NEW)         â•‘
 * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */

    /**
     * Update PM Approval Limit
     */
    public async updateApprovalLimit(
        userId: string,
        pmApprovalLimit: number
    ): Promise<{ pmApprovalLimit: number }> {
        // Get existing onboarding record
        const onboarding = await CompanyService.getOnboardingByOwnerId(userId);

        if (!onboarding) {
            throw new CustomError(
                HttpStatusCode.NotFound,
                'Onboarding not found. Please complete onboarding first.'
            );
        }

        // Update the pmApprovalLimit
        const updateData: Partial<ICompany> = {
            pmApprovalLimit,
            updatedAt: Utils.getCurrentDate()
        };

        await OnboardingRepository.getInstance().Update(
            new ObjectId(onboarding._id),
            updateData,
            ['pmApprovalLimit']
        );

        return { pmApprovalLimit };
    }








    // Admin onboarding methods can be added here

    public async getCompanyList(data: IGetOnCompanyDashboardDTO) {


        if (!Utils.checkUserRole(data.role)) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Access denied. Admins only.');
        }

        const filters: any[] = [];
        if (data?.planType) {
            filters.push({
                param: "planType",
                value: data.planType,
                operator: QueryOperators.AND,
                operationType: QueryOperationTypes.EQUALS,
            });
        }

        if (data?.companyStatus) {
            filters.push({
                param: "companyStatus",
                value: data.companyStatus,
                operator: QueryOperators.AND,
                operationType: QueryOperationTypes.EQUALS,
            });
        }

        if (data?.companyName) {
            filters.push({
                param: "companyName",
                value: data.companyName,
                operator: QueryOperators.AND,
                operationType: QueryOperationTypes.CONTAINS,
            });
        }

        // Step 1: Get onboarding list
        const onboardingList: Record<string, any> = await OnboardingRepository.getInstance().GetAll(
            filters,
            true, // paginate
            data.continuationToken,
            data.pageSize
        );

        const onboardingTenantIds = onboardingList.data.map((item: any) => item.tenantId);
        const teamCounts = await UsersRepository.getInstance().collection.aggregate([
            { $match: { tenantId: { $in: onboardingTenantIds }, isOwner: { $ne: true } } },
            { $group: { _id: "$tenantId", count: { $sum: 1 } } }
        ]).toArray();

        const teamCountMap: Record<string, number> = {};
        teamCounts.forEach(tc => {
            teamCountMap[tc._id] = tc.count;
        });

        const dataWithTeamsCount = onboardingList.data.map((item: any) => ({
            ...item,
            teamsCount: teamCountMap[item.tenantId] || 0,
            monthlyRevenue: 0,
            plan: PlanTypes.COI_CONTROL,
            invoices: 0,
            dailyLogs: 0,
            compilance: 0,
            documentProcessed: 0,
            storageUsed: 0,
        }));

        const activeCompaniesCount = dataWithTeamsCount.filter(
            (item: any) => item?.companyStatus === 'active'
        ).length;

        const paginatedResult = Utils.pagination(
            !onboardingList.continuationToken,
            dataWithTeamsCount,
            onboardingList.continuationToken || (Number(data.continuationToken || 1) + 1).toString(),
            dataWithTeamsCount.length
        );

        return {
            ...paginatedResult,
            active: activeCompaniesCount,
            totalRevenue: 0,
            totalDocumentProcessed: 0,
            documentToday: 0,
            pageSize: data.pageSize || dataWithTeamsCount.length,
            continuationToken: paginatedResult.pagination.continuationToken
        };
    }


    public async updateCompanyStatus(data) {
        const updatedOnboarding = await OnboardingRepository.getInstance().Update(new ObjectId(data._id), { companyStatus: data.companyStatus });
        return updatedOnboarding;
    }

    public async getCompanyBillingList(data: IGetCompanyBillingDTO) {

        const billingData = [
            {
                companyName: "Company A",
                planType: "Ops Control",
                amount: "499.00",
                date: new Date().toISOString(),
                paymentStatus: "Success",
            },
            {
                companyName: "Company B",
                planType: "COI Control",
                amount: "229.00",
                date: new Date().toISOString(),
                paymentStatus: "Failed",
            },
            {
                companyName: "Company C",
                  planType: "Compliance Stack",
                amount: "0.00",
                date: new Date().toISOString(),
                paymentStatus: "Success",
            }
        ];

        const billingList: Record<string, any> = await OnboardingRepository.getInstance().GetAll(
            [],
            true,
            data.continuationToken,
            data.pageSize
        );

        const dataWithFields = billingData.map(item => ({
            ...item
        }));

        const paginatedResult = Utils.pagination(
            false,
            dataWithFields,
            (Number(data.continuationToken || 1) + 1).toString(),
            dataWithFields.length
        );

        const planCounts = {
            COIControl: 9,
            OpsControl: 10,
            ComplianceStack: 100
        };

        return {
            ...paginatedResult,
            totalRevenue: 728,
            avgRevenue: 364,
            failedPayment: 1,
            planCounts,
            companyName: billingData[0]?.companyName,
            planType: billingData[0]?.planType,
            amount: billingData[0]?.amount,
            date: billingData[0]?.date,
            paymentStatus: billingData[0]?.paymentStatus,
            pageSize: data.pageSize || billingData.length,
            continuationToken: (Number(data.continuationToken || 1) + 1).toString()
        };
    }

    public async getCompanyIdByUserId(userId: string) {

        return true
    }



}

export default new UsersService;

