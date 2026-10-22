import Joi from 'joi';
import ReviewQueues from '../../core/enums/reviewQueues';
import StatusTypes from '../../core/enums/statusTypes';
import { continuationTokenValidator, idsValidator, pageSizeValidator } from '../../core/validators/generalValidators';


export const emailSubmissionsValidator = Joi.object().keys({
	submissionStatus: Joi.string().trim().when('reviewQueue', {
		is: ReviewQueues.COMPLIANCE_ALERT,
		then: Joi.valid(StatusTypes.COMPLIANT, StatusTypes.PENDING, StatusTypes.EXPIRING_SOON, StatusTypes.EXPIRED),
		otherwise: Joi.valid(StatusTypes.APPROVED, StatusTypes.REJECTED, StatusTypes.PENDING)
	}).optional().allow('').label('Query Status'),
	reviewQueue: Joi.string().trim().valid(...Object.values(ReviewQueues)).required().label('Review Queue'),
	pageSize: pageSizeValidator,
	continuationToken: continuationTokenValidator
});


export const updateSubmissionStatusParamsValidator = Joi.object().keys({
	emailSubmissionId: idsValidator.required().label('Email Submission ID')
});


export const updateInvoiceStatusValidator = Joi.object().keys({
	status: Joi.string().trim().valid(StatusTypes.APPROVED, StatusTypes.REJECTED).required().label('Status'),
	attachmentOrder: Joi.number().integer().min(1).optional().default(1).label('Attachment Order'),
	mappedJobId: Joi.string().trim().allow(null).optional().label('Mapped Job ID'),
	aiAnalysisReport: Joi.object().keys({
		vendor: Joi.string().trim().required().label('Vendor'),
		invoiceNumber: Joi.string().trim().required().label('Invoice Number'),
		invoiceDate: Joi.string().trim().required().label('Invoice Date'),
		invoiceDueDate: Joi.string().trim().allow(null).disallow('').optional().label('Invoice Due Date'),
		amount: Joi.number().required().label('Amount'),
		currency: Joi.string().trim().required().label('Currency'),
		job: Joi.string().trim().allow(null).required().label('Job'),
		lineItems: Joi.array().items(
			Joi.object().keys({
				itemName: Joi.string().trim().required().label('Item Name'),
				itemCost: Joi.number().required().label('Item Cost'),
				mappedCostCode: Joi.string().trim().allow(null).optional().label('Mapped Cost Code'),
				currency: Joi.string().trim().required().label('Currency')
			})
		).required().label('Line Items'),
		notes: Joi.string().trim().required().allow(null).label('Notes')
	}).required().label('AI Analysis Report')
});


export const updateDailyLogStatusValidator = Joi.object().keys({
	status: Joi.string().trim().valid(StatusTypes.APPROVED, StatusTypes.REJECTED).required().label('Status'),
	attachmentOrder: Joi.number().integer().min(1).optional().default(1).label('Attachment Order'),
	mappedJobId: Joi.string().trim().allow(null).optional().label('Mapped Job ID'),
	aiAnalysisReport: Joi.object().keys({
		date: Joi.string().trim().required().label('Date'),
		superintendent: Joi.string().trim().required().label('Superintendent'),
		job: Joi.string().trim().allow(null).required().label('Job'),
		tasks: Joi.array().items(
			Joi.object().keys({
				taskName: Joi.string().trim().required().label('Task Name'),
				mappedCostCode: Joi.string().trim().allow(null, '').optional().label('Mapped Cost Code'),
				hoursWorked: Joi.number().required().label('Hours Worked')
			})
		).required().label('Tasks'),
		equipment: Joi.string().trim().required().allow(null).label('Equipment')
	}).required().label('AI Analysis Report')
});


export const updateComplianceAlertStatusValidator = Joi.object().keys({
	attachmentOrder: Joi.number().integer().min(1).optional().default(1).label('Attachment Order'),
	aiAnalysisReport: Joi.object().keys({
		vendor: Joi.string().trim().required().label('Vendor'),
		certificate: Joi.string().trim().required().label('Certificate'),
		documentType: Joi.string().trim().required().label('Document Type'),
		insurer: Joi.string().trim().required().label('Insurer'),
		policyNumber: Joi.array().items(Joi.string().trim()).min(1).required().label('Policy Number'),
		effectiveDate: Joi.string().trim().required().label('Effective Date'),
		expirationDate: Joi.string().trim().required().label('Expiration Date'),
		coverage: Joi.array().items(
			Joi.object().keys({
				coveredProperty: Joi.string().trim().required().label('Covered Property'),
				amountOfInsurance: Joi.string().trim().required().label('Amount of Insurance'),
			})
		).min(1).required().label('Coverage')
	}).required().label('AI Analysis Report')
});