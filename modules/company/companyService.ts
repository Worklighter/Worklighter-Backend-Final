import { HttpStatusCode } from "axios";
import { ObjectId } from "mongodb";
import QueryOperators from "../../core/enums/queryOperators";
import QueryOperationTypes from "../../core/enums/queryOperationTypes";
import StatusTypes from "../../core/enums/statusTypes";
import UserRoles from "../../core/enums/userRoles";
import { CustomError } from "../../core/errors/custom";
import FillableField from "../../core/interfaces/fillableFields";
import UsersRepository from "../users/usersRepository";
import OnboardingRepository from "./companyRepository";
import CompanyModel from "./companyModel";
import CostCodesService from "../costCodes/costCodesService";
import WCCodesService from "../wcCodes/wcCodesService";
import { ICompanyInfo, IUpdateCompanyInfoDTO, ICompany, ICompanyDTO, ISelectedWorkflow, ITeamMember, CompanyFillableFields } from "./companyInterface";
import { IUsers } from "../users/usersInterface";
import { Utils } from "../../utils/utils";
import TenantStatus from "../../core/enums/tenantStatus";
import { INBOUND_EMAIL_SUBDOMAIN } from "../../utils/constants";
import AzureBlobStorage from "../../integration/azure/azureBlobStorage";
import { Readable } from "stream";
import DocumentETLService from "../../utils/helpers/documentETLService";
import SecurityManager from "../../utils/helpers/securityManager";
import ReviewQueues from "../../core/enums/reviewQueues";
import EmailTemplatesService from "../emailTemplates/emailTemplatesService";

class CompanyService {


	//* -------------------------------------------------------------------------- */
	//*                           GET COMPANY INFO METHOD                          */
	//* -------------------------------------------------------------------------- */
	public async getCompanyInfo(ownerId: string): Promise<ICompanyInfo | null> {
		const onboarding = await this.getOnboardingByOwnerId(ownerId);

		if (!onboarding) {
			throw new CustomError(HttpStatusCode.NotFound, 'Company information not found. Please complete onboarding first.');
		}

		return {
			_id: onboarding._id?.toString(),
			ownerId: onboarding.ownerId,
			tenantId: onboarding.tenantId,
			companyName: onboarding.companyName,
			industry: onboarding.industry,
			companyAddress: onboarding.companyAddress,
			country: onboarding.country,
			city: onboarding.city,
			state: onboarding.state,
			zipCode: onboarding.zipCode,
			timezone: onboarding.timezone,
			companyLogo: onboarding.companyLogo
		};
	}



	//* -------------------------------------------------------------------------- */
	//*                         UPDATE COMPANY INFO METHOD                         */
	//* -------------------------------------------------------------------------- */
	public async updateCompanyInfo(ownerId: string, data: IUpdateCompanyInfoDTO, companyLogo?: string): Promise<ICompanyInfo> {
		const onboarding = await this.getOnboardingByOwnerId(ownerId);

		if (!onboarding) {
			throw new CustomError(HttpStatusCode.NotFound, 'Company information not found. Please complete onboarding first.');
		}

		const updateData: Partial<ICompany> = {
			...data,
			updatedAt: Utils.getCurrentDate()
		};

		// If a new company logo is provided, update it
		if (companyLogo) {
			updateData.companyLogo = companyLogo;
		}

		const updatedOnboarding = await OnboardingRepository.getInstance().Update(
			new ObjectId(onboarding._id),
			updateData,
			[
				'_id',
				'ownerId',
				'tenantId',
				'companyName',
				'industry',
				'companyAddress',
				'country',
				'city',
				'state',
				'zipCode',
				'timezone',
				'companyLogo'
			]
		) as ICompany;

		if (!updatedOnboarding) {
			throw new CustomError(HttpStatusCode.InternalServerError, 'Failed to update company information');
		}

		return {
			_id: onboarding._id?.toString(),
			ownerId: onboarding.ownerId,
			tenantId: onboarding.tenantId,
			companyName: updatedOnboarding.companyName,
			industry: updatedOnboarding.industry,
			companyAddress: updatedOnboarding.companyAddress,
			country: updatedOnboarding.country,
			city: updatedOnboarding.city,
			state: updatedOnboarding.state,
			zipCode: updatedOnboarding.zipCode,
			timezone: updatedOnboarding.timezone,
			companyLogo: updatedOnboarding.companyLogo
		};
	}




	//* -------------------------------------------------------------------------- */
	//*                          SUBMIT ONBOARDING METHOD                          */
	//* -------------------------------------------------------------------------- */
	public async submitOnboarding(data: ICompanyDTO, ownerId: string, tenantId: string, files: any): Promise<ICompany> {

		console.log('Submitting onboarding for ownerId:', ownerId, 'step:', data.step);

		const existingOnboarding = await this.getOnboardingByOwnerId(ownerId);
		if (existingOnboarding && existingOnboarding.isPaymentCompleted) {
			throw new CustomError(HttpStatusCode.BadRequest, 'Onboarding already completed');
		}
		const step = data.step;
		if (!existingOnboarding && step !== 1) {
			throw new CustomError(HttpStatusCode.BadRequest, 'Must start with step 1');
		}

		if (existingOnboarding) {
			const currentStep = existingOnboarding.step;

			// Step 1 must be completed before any other step
			if (step >= 2 && currentStep < 1) {
				throw new CustomError(HttpStatusCode.BadRequest, 'Complete step 1 first');
			}

			// Steps 3-6 require at least step 1 to be completed (step 2 can be skipped)
			if (step >= 3 && currentStep < 1) {
				throw new CustomError(HttpStatusCode.BadRequest, 'Complete step 1 first.');
			}
		}

		// Build update data based on the current step
		// Track the highest step reached (don't regress if editing a previous step)
		const highestStep = existingOnboarding ? Math.max(existingOnboarding.step, step) : step;

		const stepData: Partial<ICompany> = {
			ownerId,
			tenantId,
			step: highestStep,
			updatedAt: Utils.getCurrentDate()
		};

		// Step 1: Company Info
		if (step === 1) {
			stepData.tenantStatus = stepData.tenantStatus || TenantStatus.TRIAL;
			stepData.companyCode = await this.generateUniqueCompanyCode(tenantId);
			stepData.assignedEmail = `${stepData.companyCode}@${INBOUND_EMAIL_SUBDOMAIN}`;
			stepData.companyName = data.companyName;
			stepData.industry = data.industry;
			stepData.companyAddress = data.companyAddress;
			stepData.country = data.country;
			stepData.city = data.city;
			stepData.state = data.state;
			stepData.zipCode = data.zipCode;
			stepData.timezone = data.timezone;
			if (files?.companyLogo) {
				const file = files.companyLogo[0];
				const stream = Readable.from(file.buffer);
				stepData.companyLogo = await AzureBlobStorage.getInstance().uploadImage(stream, file.originalname, 'company-logo', tenantId);
			}
		}

		// Step 2: Selected Workflows
		if (step === 2) {
			stepData.selectedWorkflows = data.selectedWorkflows
				? this.buildSelectedWorkflows(data.selectedWorkflows)
				: [];
		}

		const getFileGroup = (keys: string[]): Express.Multer.File[] | undefined => {
			if (!files) return undefined;
			for (const key of keys) {
				if (files[key]?.length) return files[key];
			}
			return undefined;
		};

		// Step 3: Cost Codes & Workers Comp Files
		if (step === 3) {
			const costCodesFiles = getFileGroup(['costCodesFiles', 'costCodesFiles[]', 'costCodesFile']);
			if (costCodesFiles) {
				const uploadPromises = costCodesFiles.map(async (f: any) => {
					const stream = Readable.from(f.buffer);
					return AzureBlobStorage.getInstance().uploadDocument(stream, f.originalname, undefined, tenantId);
				});
				stepData.costCodesFiles = await Promise.all(uploadPromises);
				await this.importCostCodeFiles(costCodesFiles, ownerId, tenantId);
			}

			const workersCompFiles = getFileGroup(['workersCompFiles', 'workersCompFiles[]', 'workersCompFile']);
			if (workersCompFiles) {
				const uploadPromises = workersCompFiles.map(async (f: any) => {
					const stream = Readable.from(f.buffer);
					return AzureBlobStorage.getInstance().uploadDocument(stream, f.originalname, undefined, tenantId);
				});
				stepData.workersCompFiles = await Promise.all(uploadPromises);
				await this.importWorkersCompFiles(workersCompFiles, ownerId, tenantId);
			}
		}

		// Step 4: Compliance Documents
		if (step === 4) {
			if (data.expirationAlerts) {
				stepData.expirationAlerts = this.parseArrayField(data.expirationAlerts);
			}
		}

		// Step 5: Approval Limits
		if (step === 5) {
			if (data.pmApprovalLimit) {
				stepData.pmApprovalLimit = parseInt(data.pmApprovalLimit);
			}
		}

		// Step 6: Team Members — create user records only; do NOT store on company document
		if (step === 6) {
			if (data.teamMembers) {
				await this.parseTeamMembers(data.teamMembers, tenantId);
			}
		}

		// Step 6: Send team invitations — onboarding is NOT yet complete (payment required)
		if (step === 6) {

			const userRepo = UsersRepository.getInstance();

			// Fetch team members from Users collection by tenantId.
			// Explicitly exclude the onboarding owner by _id — the isOwner flag alone is
			// unreliable if not consistently set, and this prevents the registered user
			// from having their password reset and receiving an invitation to their own account.
			const dbTeamMembers = await userRepo.collection
				.find({ tenantId, isOwner: { $ne: true }, _id: { $ne: new ObjectId(ownerId) } })
				.toArray();

			if (dbTeamMembers.length === 0) {
				console.log('No team members found for this onboarding');
			} else {
				// Generate a single temporary password for emails
				const tempPassword = Utils.generateRandomPassword();
				const passwordHash = await SecurityManager.hashPassword(tempPassword);

				// Activate users and set password
				const updatePromises = dbTeamMembers.map(user =>
					userRepo.Update(
						new ObjectId(user._id),
						{
							accountStatus: StatusTypes.ACTIVE,
							password: passwordHash,
							updatedAt: Utils.getCurrentDate()
						}
					)
				);
				await Promise.all(updatePromises);
				const membersWithPasswords = dbTeamMembers.map(user => ({
					email: user.email,
					firstName: user.firstName,
					role: user.role,
					password: tempPassword,
				}));

				await EmailTemplatesService.sendTeamInvitations(membersWithPasswords, existingOnboarding.companyName);
			}
		}



		let savedOnboarding: ICompany;

		if (existingOnboarding) {
			// Update existing onboarding record
			const updatedOnboarding = await OnboardingRepository.getInstance().Update(
				new ObjectId(existingOnboarding._id),
				stepData,
				Object.keys(stepData)
			) as ICompany;
			savedOnboarding = updatedOnboarding;
		} else {
			// Create new onboarding record (first step)
			stepData.createdAt = Utils.getCurrentDate();
			stepData.isCompleted = false;

			const onboardingModel: Record<string, any> = {};
			CompanyFillableFields.forEach((field: FillableField) => {
				onboardingModel[field.column] = null;
			});

			Object.keys(stepData).forEach((key: string) => {
				onboardingModel[key] = stepData[key];
			});

			const companyModel = CompanyModel.create(onboardingModel);
			savedOnboarding = await OnboardingRepository.getInstance().Add(companyModel) as ICompany;
		}

		// Process uploaded documents through ETL pipeline (Steps 3 & 4)
		const hasUploadedFiles = !!(
			getFileGroup(['costCodesFiles', 'costCodesFiles[]', 'costCodesFile']) ||
			getFileGroup(['workersCompFiles', 'workersCompFiles[]', 'workersCompFile']) ||
			getFileGroup(['complianceDocuments', 'complianceDocuments[]', 'complianceDocument'])
		);

		if ((step === 3 || step === 4) && hasUploadedFiles) {
			console.log('Starting ETL processing for tenantId:', tenantId);
			try {
				const processedDocs = await DocumentETLService.processFiles(files, ownerId, tenantId);
				console.log('ETL completed. Documents processed:', processedDocs.length);
			} catch (error) {
				console.error('ETL Error:', error);
			}
		}

		// Fetch complete onboarding record with all steps data
		const completeOnboarding = await this.getOnboardingByOwnerId(ownerId);
		return completeOnboarding as ICompany;


	}



	//* -------------------------------------------------------------------------- */
	//*                      GET ONBOARDING BY OWNER ID METHOD                     */
	//* -------------------------------------------------------------------------- */
	public async getOnboardingByOwnerId(ownerId: string): Promise<ICompany | null> {
		const onboardingRepo = OnboardingRepository.getInstance();

		const onboardingRecords = await onboardingRepo.collection
			.find({
				deletedAt: null,
				$or: [
					{ ownerId },
					{ userId: ownerId }
				]
			})
			.toArray() as any[];

		if (!onboardingRecords.length) {
			return null;
		}

		const sortedRecords = onboardingRecords.sort((a: any, b: any) => {
			const aStep = Number(a?.step ?? 0);
			const bStep = Number(b?.step ?? 0);
			if (bStep !== aStep) return bStep - aStep;

			const aUpdatedAt = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
			const bUpdatedAt = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
			if (bUpdatedAt !== aUpdatedAt) return bUpdatedAt - aUpdatedAt;

			return new ObjectId(b._id).getTimestamp().getTime() - new ObjectId(a._id).getTimestamp().getTime();
		});

		const primaryRecord = sortedRecords[0];
		const primaryRecordId = new ObjectId(primaryRecord._id);

		// Backward compatibility: migrate legacy userId key -> ownerId on the selected record
		if (!primaryRecord.ownerId) {
			await onboardingRepo.collection.updateOne(
				{ _id: primaryRecordId },
				{
					$set: {
						ownerId,
						updatedAt: Utils.getCurrentDate()
					},
					$unset: {
						userId: ''
					}
				}
			);
		}

		// Keep only one onboarding record for this owner
		if (sortedRecords.length > 1) {
			const duplicateIds = sortedRecords
				.slice(1)
				.map((record: any) => new ObjectId(record._id));

			if (duplicateIds.length) {
				await onboardingRepo.collection.deleteMany({ _id: { $in: duplicateIds } });
			}
		}

		const onboarding = await onboardingRepo.collection.findOne({ _id: primaryRecordId });
		if (!onboarding) {
			return null;
		}

		return this.normalizeOnboardingData(onboarding);
	}


	//* -------------------------------------------------------------------------- */
	//*                       HAS COMPLETED ONBOARDING METHOD                      */
	//* -------------------------------------------------------------------------- */
	public async hasCompletedOnboarding(ownerId: string): Promise<boolean> {
		const onboarding = await this.getOnboardingByOwnerId(ownerId);
		return onboarding?.isPaymentCompleted || false;
	}



	//* -------------------------------------------------------------------------- */
	//*                          PARSE ARRAY FIELD METHOD                          */
	//* -------------------------------------------------------------------------- */
	private parseArrayField(field: string): string[] {
		try {
			const parsed = JSON.parse(field);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return field.split(',').map(item => item.trim()).filter(Boolean);
		}
	}

	private async importCostCodeFiles(
		files: Express.Multer.File[],
		userId: string,
		tenantId: string
	): Promise<void> {
		const service = CostCodesService.getInstance();

		for (const file of files) {
			await service.importFromCSV(file, userId, tenantId);
		}
	}

	private async importWorkersCompFiles(
		files: Express.Multer.File[],
		userId: string,
		tenantId: string
	): Promise<void> {
		const service = WCCodesService.getInstance();

		for (const file of files) {
			await service.importFromCSV(file, userId, tenantId);
		}
	}



	//* -------------------------------------------------------------------------- */
	//*                   GENERATE UNIQUE COMPANY CODE METHOD                      */
	//* -------------------------------------------------------------------------- */
	private async generateUniqueCompanyCode(tenantId: string, length: number = 8): Promise<string> {
		const code = Utils.generateRandomCode(length);

		const existingCompany = await OnboardingRepository.getInstance().GetOneByParams([
			{ param: 'companyCode', value: code, operator: QueryOperators.AND },
			{ param: 'tenantId', value: tenantId, operator: QueryOperators.AND, operationType: QueryOperationTypes.NOT_EQUALS }
		]);

		if (existingCompany) {
			return this.generateUniqueCompanyCode(tenantId, length);
		}

		return code;
	}



	//* -------------------------------------------------------------------------- */
	//*                     NORMALIZE ONBOARDING DATA METHOD                       */
	//* -------------------------------------------------------------------------- */
	private normalizeOnboardingData(onboarding: any): ICompany {
		const normalizedOnboarding: Record<string, any> = {};

		CompanyFillableFields.forEach((field: FillableField) => {
			normalizedOnboarding[field.column] = null;
		});

		return {
			...normalizedOnboarding,
			...onboarding
		} as ICompany;
	}



	//* -------------------------------------------------------------------------- */
	//*                      BUILD SELECTED WORKFLOWS METHOD                       */
	//* -------------------------------------------------------------------------- */
	private buildSelectedWorkflows(field: string): ISelectedWorkflow[] {
		const workflowNames = this.parseArrayField(field);
		const selectedSet = new Set(workflowNames.map((n: string) => n.toLowerCase()));

		return Object.values(ReviewQueues)
			.filter(workflowName => workflowName !== ReviewQueues.UNCLASSIFIED)
			.map((workflowName: string) => ({
				workflowName,
				connected: selectedSet.has(workflowName.toLowerCase()),
			}));
	}



	//* -------------------------------------------------------------------------- */
	//*                         PARSE TEAM MEMBERS METHOD                          */
	//* -------------------------------------------------------------------------- */
	private async parseTeamMembers(teamMembersStr: string, tenantId: string) {
		let teamMembers: ITeamMember[] = [];
		try {
			const parsed = JSON.parse(teamMembersStr);
			teamMembers = Array.isArray(parsed) ? parsed : [];
		} catch (err) {
			console.error('Invalid team members JSON string:', err);
			return [];
		}

		const userRepo = UsersRepository.getInstance();

		const seenEmails = new Set<string>();
		const uniqueTeamMembers = teamMembers.filter(member => {
			if (seenEmails.has(member.email)) return false;
			seenEmails.add(member.email);
			return true;
		});

		const emailList = uniqueTeamMembers.map(m => m.email);
		const searchFilter: any = [
			{ param: 'email', value: emailList, operator: QueryOperators.AND, operationType: QueryOperationTypes.IN }
		]
		const existingUsers = await userRepo.GetAll<any[]>(
			searchFilter,
			false,
			null,
			undefined,
			undefined,
			['email']
		) as any[];

		if (existingUsers.length > 0) {
			const conflictingEmails = existingUsers.map((u: any) => u.email).join(', ');
			throw new CustomError(HttpStatusCode.Conflict, `The following email(s) are already registered and cannot be added as team members: ${conflictingEmails}`);
		}

		uniqueTeamMembers.forEach(member => {
			const username = member.email.split('@')[0];
			member.tenantId = tenantId;
			member.role = UserRoles.ADMIN === member.role ? UserRoles.ADMIN : UserRoles.PROJECTMANAGER;
			member.createdAt = Utils.getCurrentDate();
			member.updatedAt = Utils.getCurrentDate();
			member.emailVerifiedAt = "false";
			member.password = Utils.generateRandomPassword();
			member.accountStatus = StatusTypes.INACTIVE;
			member.fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
			member.username = username;
		});

		if (uniqueTeamMembers.length > 0) {
			await UsersRepository.getInstance().AddMany(uniqueTeamMembers);
		}
		return uniqueTeamMembers;
	}

}



export default new CompanyService();
