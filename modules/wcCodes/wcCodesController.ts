import express, { Request, Response } from 'express';
import { HttpStatusCode } from 'axios';
import WCCodesService from './wcCodesService';
import { Utils } from '../../utils/utils';
import { CustomError } from '../../core/errors/custom';
import {
    createWCCodeSchema,
    updateWCCodeSchema,
    listWCCodesSchema,
    wcCodeIdSchema
} from './wcCodesValidation';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { csvUpload } from '../../middlewares/fileUploadMiddleware';
import { validateRequestQueryViaMiddleware, validateRequestParamsViaMiddleware, validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';
import { IListWCCodesDTO } from './wcCodesInterface';
import { PAGE, PER_PAGE } from '../../utils/constants';

//* -------------------------------------------------------------------------- */
//*                          WC CODES CONTROLLER                              */
//* -------------------------------------------------------------------------- */

const router = express.Router();
const service = WCCodesService.getInstance();

//* -------------------------------------------------------------------------- */
//*                        API TO LIST WC CODES                                */
//* -------------------------------------------------------------------------- */
router.get('', authMiddleware, requireActiveSubscription, validateRequestQueryViaMiddleware(listWCCodesSchema), async (req: Request, res: Response) => {

    const data:IListWCCodesDTO = {
        searchText: req.validatedQuery?.searchText || null,
        continuationToken: req.validatedQuery?.continuationToken ?? PAGE,
        pageSize: req.validatedQuery?.pageSize || PER_PAGE
    }

    const paginated = await service.listWCCodes(data, req.user);

    res.setHeader('Cache-Control', 'no-store');

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'WC codes retrieved successfully',
        data: paginated
    });
});




//* -------------------------------------------------------------------------- */
//*                    API TO IMPORT WC CODES FROM CSV                         */
//* -------------------------------------------------------------------------- */
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




//* -------------------------------------------------------------------------- */
//*                    API TO DOWNLOAD WC CODES TEMPLATE                       */
//* -------------------------------------------------------------------------- */
router.get('/download-template', authMiddleware, requireActiveSubscription, async (req: Request, res: Response) => {
    const template = await service.downloadTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=wc-codes-template.csv');
    res.send(template);
});




//* -------------------------------------------------------------------------- */
//*                        API TO GET WC CODE BY ID                            */
//* -------------------------------------------------------------------------- */
router.get('/:id', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(wcCodeIdSchema), async (req: Request, res: Response) => {

    const { id } = req['validatedParams'];
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const wcCode = await service.getWCCodeById(id as string, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'WC code retrieved successfully',
        data: wcCode
    });
});




//* -------------------------------------------------------------------------- */
//*                        API TO CREATE WC CODE                               */
//* -------------------------------------------------------------------------- */
router.post('', authMiddleware, requireActiveSubscription, validateRequestBodyViaMiddleware(createWCCodeSchema), async (req: Request, res: Response) => {

    const userId = req.user.id;
    const tenantId = req.user.tenantId || req.user.id;

    if (!tenantId) {
        throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
    }

    const body = req['validatedBody'];
    const wcCode = await service.createWCCode(body, userId, tenantId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'WC code created successfully',
        data: wcCode
    });
});




//* -------------------------------------------------------------------------- */
//*                        API TO UPDATE WC CODE                               */
//* -------------------------------------------------------------------------- */
router.patch(
    '/:id',
    authMiddleware,
    requireActiveSubscription,
    validateRequestParamsViaMiddleware(wcCodeIdSchema),
    validateRequestBodyViaMiddleware(updateWCCodeSchema),
    async (req: Request, res: Response) => {
        const { id } = req['validatedParams'];
        const userId = req.user.id;
        const tenantId = req.user.tenantId || req.user.id;

        if (!tenantId) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
        }

        const wcCode = await service.updateWCCode(id as string, req['validatedBody'], userId, tenantId);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'WC code updated successfully',
            data: wcCode
        });
    }
);


//* -------------------------------------------------------------------------- */
//*                        API TO DELETE WC CODE                               */
//* -------------------------------------------------------------------------- */
router.delete(
    '/:id',
    authMiddleware,
    requireActiveSubscription,
    validateRequestParamsViaMiddleware(wcCodeIdSchema),
    async (req: Request, res: Response) => {
        const { id } = req['validatedParams'];
        const userId = req.user.id;
        const tenantId = req.user.tenantId || req.user.id;

        if (!tenantId) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');
        }

        const result = await service.deleteWCCode(id as string, userId, tenantId);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: result.message,
            data: null
        });
    }
);



export default router;
