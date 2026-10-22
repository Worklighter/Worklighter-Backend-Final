import express, { Request, Response } from "express";
import { HttpStatusCode } from "axios";
import { authMiddleware } from "../../middlewares/authMiddleware";
import requireActiveSubscription from "../../middlewares/requireActiveSubscription";
import { knowledgeBaseUpload } from "../../middlewares/fileUploadMiddleware";
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from "../../core/validators/globalValidators";
import { Utils } from "../../utils/utils";
import { CustomError } from "../../core/errors/custom";
import KnowledgeBaseService from "./knowledgeBaseService";
import {
    askKnowledgeBaseSchema,
    createKnowledgeBaseSchema,
    deleteKnowledgeBaseSchema,
    getKnowledgeBaseByIdSchema,
    listKnowledgeBaseSchema,
    searchKnowledgeBaseSchema
} from "./knowledgeBaseValidator";

const router = express.Router();
const service = KnowledgeBaseService.getInstance();

/*
 * POST /api/v1/knowledge-base
 * Create KB entry from text or file upload (multipart/form-data)
 */
router.post(
    '',
    authMiddleware,
    requireActiveSubscription,
    knowledgeBaseUpload,
    validateRequestBodyViaMiddleware(createKnowledgeBaseSchema),
    async (req: Request, res: Response) => {
        const body = req['validatedBody'];
        const file = req.file;

        if ((!Array.isArray(body?.content) || !body.content.length) && !file) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Either content or file upload is required');
        }

        const created = await service.createKBEntry(body, file, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Created,
            status: true,
            responseCode: '201',
            responseDescription: 'Knowledge base entry created successfully',
            data: created,
        });
    }
);

/*
 * GET /api/v1/knowledge-base
 * List KB entries scoped to user + tenant
 */
router.get(
    '',
    authMiddleware,
    requireActiveSubscription,
    validateRequestQueryViaMiddleware(listKnowledgeBaseSchema),
    async (req: Request, res: Response) => {
        const query = req['validatedQuery'];
        const result = await service.getKBEntries(query, req.user);

        const currentCount = result.data?.length || 0;
        const fetchedSoFar = (result.page - 1) * result.pageSize + currentCount;
        const lastPage = fetchedSoFar >= result.total;
        const nextContinuationToken = lastPage ? null : String(result.page * result.pageSize);

        const paginated = Utils.pagination(lastPage, result.data, nextContinuationToken, result.total);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Knowledge base entries retrieved successfully',
            data: paginated,
        });
    }
);

/*
 * POST /api/v1/knowledge-base/search
 * Semantic search over KB vector index (scoped)
 */
router.post(
    '/search',
    authMiddleware,
    requireActiveSubscription,
    validateRequestBodyViaMiddleware(searchKnowledgeBaseSchema),
    async (req: Request, res: Response) => {
        const body = req['validatedBody'];
        const result = await service.searchKBEntries(body, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Knowledge base search completed successfully',
            data: result,
        });
    }
);

/*
 * POST /api/v1/knowledge-base/ask
 * RAG answer generation over KB with citations (scoped)
 */
router.post(
    '/ask',
    authMiddleware,
    requireActiveSubscription,
    validateRequestBodyViaMiddleware(askKnowledgeBaseSchema),
    async (req: Request, res: Response) => {
        const body = req['validatedBody'];
        const result = await service.askKnowledgeBase(body, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Knowledge base answer generated successfully',
            data: result,
        });
    }
);

/*
 * GET /api/v1/knowledge-base/:id
 * Get KB entry by id (scoped). If ingested, includes vectorChunks.
 */
router.get(
    '/:id',
    authMiddleware,
    requireActiveSubscription,
    validateRequestParamsViaMiddleware(getKnowledgeBaseByIdSchema),
    async (req: Request, res: Response) => {
        const { id } = req['validatedParams'];
        const kb = await service.getKBEntry({ id }, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Knowledge base entry retrieved successfully',
            data: kb,
        });
    }
);

/*
 * DELETE /api/v1/knowledge-base/:id
 * Delete KB entry + vector chunks (scoped)
 */
router.delete(
    '/:id',
    authMiddleware,
    requireActiveSubscription,
    validateRequestParamsViaMiddleware(deleteKnowledgeBaseSchema),
    async (req: Request, res: Response) => {
        const { id } = req['validatedParams'];
        const result = await service.deleteKBEntry(id, req.user);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: result.message,
            data: null,
        });
    }
);

export default router;
