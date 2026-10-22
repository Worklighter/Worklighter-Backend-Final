import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';
import EmailsService from './emailsService';
// import { ISendEmailDTO } from './emailsInterface';
// import { sendEmailValidator } from './emailsValidator';
const routes = express.Router();


//* API TO SEND EMAIL
// routes.post('/', authMiddleware, validateRequestBodyViaMiddleware(sendEmailValidator), async (req: Request, res: Response) => {
//     const result: ISendEmailDTO = await req.validatedBody;
//     await EmailsService.sendEmail(result, req.user);
//     Utils.apiResponse({
//         res,
//         code: HttpStatusCode.Ok,
//         status: true,
//         responseCode: '200',
//         responseDescription: 'Email sent successfully'
//     });
// });


export default routes;