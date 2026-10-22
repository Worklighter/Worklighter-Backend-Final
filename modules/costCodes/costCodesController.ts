import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import CostCodesService from './costCodesService';
import { Utils } from '../../utils/utils';
import { CustomError } from '../../core/errors/custom';
import {
    createCostCodeSchema,
    updateCostCodeSchema,
    listCostCodesSchema,
    costCodeIdSchema
} from './costCodesValidation';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { csvUpload } from '../../middlewares/fileUploadMiddleware';
import { validateRequestQueryViaMiddleware, validateRequestParamsViaMiddleware, validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';

/**
 * ╔═══════════════════════════════════════╗
 * ║      COST CODES CONTROLLER            ║
 * ╚═══════════════════════════════════════╝
 */

const router = express.Router();
const service = CostCodesService.getInstance();

/*
 * GET /api/v1/cost-codes
 * List cost codes with search and pagination
 */
router.get('', authMiddleware, requireActiveSubscription, validateRequestQueryViaMiddleware(listCostCodesSchema), async (req: Request, res: Response) => {
    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const paginated = await service.listCostCodes(req['validatedQuery'], userId, tenantId);

    res.setHeader('Cache-Control', 'no-store');

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Cost codes retrieved successfully',
        data: paginated
    });
});

/*
 * POST /api/v1/cost-codes/import
 * Import cost codes from CSV
 * IMPORTANT: Must come BEFORE /:id route to avoid route conflicts
 */
router.post('/import', authMiddleware, requireActiveSubscription, csvUpload, async (req: Request, res: Response) => {
    if (!req.file) {
        throw new CustomError(Number(HttpStatusCode.BadRequest), 'No file uploaded');
    }

    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    const result = await service.importFromCSV(req.file, userId, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: `Import completed: ${result.success} successful, ${result.failed} failed`,
        data: result
    });
});

/*
 * GET /api/v1/cost-codes/download-template
 * Download CSV template
 * IMPORTANT: Must come BEFORE /:id route to avoid route conflicts
 */
router.get('/download-template', authMiddleware, requireActiveSubscription, async (req: Request, res: Response) => {
    const template = await service.downloadTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=cost-codes-template.csv');
    res.send(template);
});

/*
 * GET /api/v1/cost-codes/:id
 * Get a single cost code by ID
 */
router.get('/:id', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(costCodeIdSchema), async (req: Request, res: Response) => {
    const { id } = req['validatedParams'];
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const costCode = await service.getCostCodeById(id, tenantId, req.user.id);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Cost code retrieved successfully',
        data: costCode
    });
});

/*
 * POST /api/v1/cost-codes
 * Create a new cost code
 */
router.post('', authMiddleware, requireActiveSubscription, validateRequestBodyViaMiddleware(createCostCodeSchema), async (req: Request, res: Response) => {
    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const body = req['validatedBody'];
    const costCode = await service.createCostCode(body, userId, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'Cost code created successfully',
        data: costCode
    });
});

/*
 * PATCH /api/v1/cost-codes/:id
 * Update a cost code
 */
router.patch('/:id', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(costCodeIdSchema), validateRequestBodyViaMiddleware(updateCostCodeSchema), async (req: Request, res: Response) => {
    const { id } = req['validatedParams'];
    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const costCode = await service.updateCostCode(id, req['validatedBody'], userId, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Cost code updated successfully',
        data: costCode
    });
});

/*
 * DELETE /api/v1/cost-codes/:id
 * Delete a cost code (soft delete)
 */
router.delete('/:id', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(costCodeIdSchema), async (req: Request, res: Response) => {
    const { id } = req['validatedParams'];
    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const result = await service.deleteCostCode(id, userId, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: result.message,
        data: null
    });
});

export default router;
