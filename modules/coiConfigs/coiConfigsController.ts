import express, { Request, Response } from "express";
import { HttpStatusCode } from "axios";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { Utils } from "../../utils/utils";
import CoiConfigsService from "./coiConfigsService";
import { IUpdateAlertConfigDTO } from "./coiConfigsInterface";
import {
    addRecipientValidator,
    addScheduleValidator,
    recipientEmailParamsValidator,
    scheduleIdParamsValidator,
    updateAlertConfigValidator
} from "./coiConfigsValidator";
import {
    validateRequestBodyViaMiddleware,
    validateRequestParamsViaMiddleware
} from "../../core/validators/globalValidators";

const routes = express.Router();

routes.get('/config', authMiddleware, async (req: Request, res: Response) => {
    const result = await CoiConfigsService.getAlertConfig(req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Alert configuration retrieved successfully',
        data: result
    });
});

routes.put('/config', authMiddleware, validateRequestBodyViaMiddleware(updateAlertConfigValidator), async (req: Request, res: Response) => {
    const data: IUpdateAlertConfigDTO = req.validatedBody;
    const result = await CoiConfigsService.updateAlertConfig(data, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Alert configuration updated successfully',
        data: result
    });
});

routes.post('/config/external/schedule', authMiddleware, validateRequestBodyViaMiddleware(addScheduleValidator), async (req: Request, res: Response) => {
    const { days } = req.validatedBody;
    const result = await CoiConfigsService.addExternalSchedule(days, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'External schedule added successfully',
        data: result
    });
});

routes.delete('/config/external/schedule/:scheduleId', authMiddleware, validateRequestParamsViaMiddleware(scheduleIdParamsValidator), async (req: Request, res: Response) => {
    const { scheduleId } = req.validatedParams;
    const result = await CoiConfigsService.removeExternalSchedule(scheduleId, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'External schedule removed successfully',
        data: result
    });
});

routes.post('/config/internal/schedule', authMiddleware, validateRequestBodyViaMiddleware(addScheduleValidator), async (req: Request, res: Response) => {
    const { days } = req.validatedBody;
    const result = await CoiConfigsService.addInternalSchedule(days, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Internal schedule added successfully',
        data: result
    });
});

routes.delete('/config/internal/schedule/:scheduleId', authMiddleware, validateRequestParamsViaMiddleware(scheduleIdParamsValidator), async (req: Request, res: Response) => {
    const { scheduleId } = req.validatedParams;
    const result = await CoiConfigsService.removeInternalSchedule(scheduleId, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Internal schedule removed successfully',
        data: result
    });
});

routes.post('/config/internal/recipients', authMiddleware, validateRequestBodyViaMiddleware(addRecipientValidator), async (req: Request, res: Response) => {
    const { email } = req.validatedBody;
    const result = await CoiConfigsService.addCCRecipient(email, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'CC recipient added successfully',
        data: result
    });
});

routes.delete('/config/internal/recipients/:email', authMiddleware, validateRequestParamsViaMiddleware(recipientEmailParamsValidator), async (req: Request, res: Response) => {
    const { email } = req.validatedParams;
    const result = await CoiConfigsService.removeCCRecipient(email, req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'CC recipient removed successfully',
        data: result
    });
});

export default routes;
