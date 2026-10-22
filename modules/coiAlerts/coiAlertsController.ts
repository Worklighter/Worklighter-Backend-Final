import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { validateRequestBody, validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import CoiAlertsService from './coiAlertsService';
import { PAGE, PER_PAGE } from '../../utils/constants';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import AzureBlobStorage from '../../integration/azure/azureBlobStorage';
import { coiDocumentUpload } from '../../middlewares/fileUploadMiddleware';
import {
    IUpdateVendorDTO,
    IGetVendorsDTO
} from './coiAlertsInterface';
import {
    createVendorValidator,
    updateVendorValidator,
    getVendorsValidator,
    vendorIdParamsValidator,
    sendReminderParamsValidator,
    sendReminderBodyValidator
} from './coiAlertsValidator';

const routes = express.Router();
type VendorListResult = { data?: any[]; continuationToken?: string | null };

const buildVendorsPagination = (result: VendorListResult, total?: number) =>
    Utils.pagination(
        !result.continuationToken,
        result.data || [],
        result.continuationToken || null,
        total
    );

routes.post('', authMiddleware, requireActiveSubscription, coiDocumentUpload, async (req: Request, res: Response) => {
    if (!req.file) {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.BadRequest,
            status: false,
            responseCode: '400',
            responseDescription: 'No COI document uploaded'
        });
        return;
    }

    validateRequestBody(createVendorValidator, req);
    const value = req.validatedBody;

    let ccRecipients = value.ccRecipients;
    if (typeof ccRecipients === 'string') {
        try {
            ccRecipients = JSON.parse(ccRecipients);
        } catch (e) {
            ccRecipients = [];
        }
    }

    const file = req.file;
    const stream = Readable.from(file.buffer);
    const coiDocumentUrl = await AzureBlobStorage.getInstance().uploadDocument(stream, file.originalname, undefined, req.user?.tenantId);

    const vendorData = {
        vendorName: value.vendorName,
        vendorEmail: value.vendorEmail,
        coiExpirationDate: value.coiExpirationDate,
        coiDocument: coiDocumentUrl,
        emailTemplate: value.emailTemplate,
        emailSubject: value.emailSubject,
        emailBody: value.emailBody,
        ccRecipients: ccRecipients || []
    };

    const result = await CoiAlertsService.createVendor(vendorData, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'Vendor created successfully with COI document',
        data: result
    });
});

routes.get('/dashboard', authMiddleware, requireActiveSubscription, async (req: Request, res: Response) => {
    try {
        const data: IGetVendorsDTO = {
            searchText: typeof req.query?.searchText === 'string' ? req.query.searchText : undefined,
            continuationToken: typeof req.query?.continuationToken === 'string' ? parseInt(req.query.continuationToken, 10) : PAGE,
            pageSize: typeof req.query?.pageSize === 'string' ? parseInt(req.query.pageSize, 10) : PER_PAGE,
            status: typeof req.query?.status === 'string' ? req.query.status as any : undefined
        };

        const vendorStats = await CoiAlertsService.getVendorStats(req.user);

        const vendorList = await CoiAlertsService.getVendors(data, req.user) as VendorListResult;
        const totalVendors = await CoiAlertsService.getVendorCount(data, req.user);
        const dashboardVendors = buildVendorsPagination(vendorList, totalVendors);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Dashboard data retrieved successfully',
            data: {
                statistics: vendorStats,
                vendors: dashboardVendors
            }
        });
    } catch (error) {
        console.error('Error in /vendors/dashboard:', error);
        Utils.apiResponse({
            res,
            code: HttpStatusCode.InternalServerError,
            status: false,
            responseCode: '500',
            responseDescription: error.message || 'Error retrieving dashboard data',
            data: {}
        });
    }
});

routes.get('', authMiddleware, requireActiveSubscription, validateRequestQueryViaMiddleware(getVendorsValidator), async (req: Request, res: Response) => {
    const data: IGetVendorsDTO = {
        searchText: req.validatedQuery?.searchText ?? null,
        continuationToken: req.validatedQuery?.continuationToken ?? PAGE,
        pageSize: req.validatedQuery?.pageSize ?? PER_PAGE,
        status: req.validatedQuery?.status ?? null
    };

    const result = await CoiAlertsService.getVendors(data, req.user) as VendorListResult;
    const paginatedVendors = buildVendorsPagination(result);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: result.data && result.data.length ? 'Vendors retrieved successfully' : 'No vendors found',
        data: paginatedVendors
    });
});

routes.get('/:vendorId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(vendorIdParamsValidator), async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams;
    const result = await CoiAlertsService.getVendorById(vendorId, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Vendor retrieved successfully',
        data: result
    });
});

routes.put('/:vendorId', authMiddleware, requireActiveSubscription, coiDocumentUpload, validateRequestParamsViaMiddleware(vendorIdParamsValidator), validateRequestBodyViaMiddleware(updateVendorValidator), async (req: Request, res: Response) => {
    let ccRecipients = req.validatedBody.ccRecipients;
    if (typeof ccRecipients === 'string') {
        try {
            ccRecipients = JSON.parse(ccRecipients);
        } catch (e) {
            ccRecipients = [];
        }
    }

    const data: IUpdateVendorDTO = {
        vendorId: req.validatedParams.vendorId,
        ...req.validatedBody,
        ccRecipients: ccRecipients as string[] | undefined
    };

    if (req.file) {
        const file = req.file;
        const stream = Readable.from(file.buffer);
        data.coiDocument = await AzureBlobStorage.getInstance().uploadDocument(stream, file.originalname, undefined, req.user?.tenantId);
    }

    const result = await CoiAlertsService.updateVendor(data, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Vendor updated successfully',
        data: result
    });
});

routes.delete('/:vendorId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(vendorIdParamsValidator), async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams;
    await CoiAlertsService.deleteVendor(vendorId, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Vendor deleted successfully',
        data: {}
    });
});

routes.get('/vendor-document/:vendorId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(vendorIdParamsValidator), async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams;
    const vendor = await CoiAlertsService.getVendorById(vendorId, req.user);

    const filename = (vendor as any).coiDocument;
    if (!filename) {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.NotFound,
            status: false,
            responseCode: '404',
            responseDescription: 'No COI document found for this vendor'
        });
        return;
    }

    if (typeof filename === 'string' && /^https?:\/\//i.test(filename)) {
        res.redirect(filename);
        return;
    }

    const filePath = path.join(process.cwd(), 'uploads/coi-documents/', filename);

    if (!fs.existsSync(filePath)) {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.NotFound,
            status: false,
            responseCode: '404',
            responseDescription: 'COI document file not found'
        });
        return;
    }

    res.sendFile(filePath);
});

routes.delete('/vendor-document/:vendorId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(vendorIdParamsValidator), async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams;
    const result = await CoiAlertsService.deleteCOIDocument(vendorId, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'COI document deleted successfully',
        data: result
    });
});

routes.post('/reminder/:vendorId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(sendReminderParamsValidator), validateRequestBodyViaMiddleware(sendReminderBodyValidator), async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams;
    const { reminderType } = req.validatedBody;

    await CoiAlertsService.sendManualReminder(vendorId, reminderType, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Reminder sent successfully',
        data: {}
    });
});

routes.post('/test-email', authMiddleware, requireActiveSubscription, async (req: Request, res: Response) => {
    await CoiAlertsService.testEmailConfiguration(req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Test email sent successfully',
        data: {}
    });
});

export default routes;
