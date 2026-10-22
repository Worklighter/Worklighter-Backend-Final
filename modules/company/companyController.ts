import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { validateRequestBodyViaMiddleware } from '../../core/validators/globalValidators';
import UsersService from '../users/usersService';
import CompanyService from './companyService';
import { ICompanyDTO, IUpdateCompanyInfoDTO } from './companyInterface';
import { updateCompanyInfoValidator,updateApprovalLimitValidator, onboardingValidator } from '../users/usersValidator';
import { companyLogoUpload, onboardingUpload } from '../../middlewares/fileUploadMiddleware';
import AzureBlobStorage from '../../integration/azure/azureBlobStorage';
import { Readable } from 'stream';

import multer from 'multer';
const routes = express.Router();



//* API TO UPDATE APPROVAL LIMIT
routes.patch('/approval-rules', authMiddleware, requireActiveSubscription, validateRequestBodyViaMiddleware(updateApprovalLimitValidator),
    async (req: Request, res: Response) => {
        const userId = req.user?.id;
        const { pmApprovalLimit } = req.validatedBody;
        const result = await UsersService.updateApprovalLimit(userId, pmApprovalLimit);

        Utils.apiResponse({
            res,
            code: HttpStatusCode.Ok,
            status: true,
            responseCode: '200',
            responseDescription: 'Approval limit updated successfully',
            data: result
        });
    }
);



//* API TO GET COMPANY INFORMATION
routes.get('/me', authMiddleware, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const companyInfo = await CompanyService.getOnboardingByOwnerId(userId);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Company information retrieved successfully',
        data: companyInfo
    });
});



//* API TO UPDATE COMPANY INFORMATION
routes.patch('/me', authMiddleware, requireActiveSubscription, companyLogoUpload, validateRequestBodyViaMiddleware(updateCompanyInfoValidator), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    
    let companyLogoUrl: string | undefined;
    if (req.file) {
        const stream = Readable.from(req.file.buffer);
        companyLogoUrl = await AzureBlobStorage.getInstance().uploadImage(stream, req.file.originalname, 'company-logo', req.user?.tenantId);
    }
    
    const updateData: IUpdateCompanyInfoDTO = {
        ...req.validatedBody
    };

    const updatedCompanyInfo = await CompanyService.updateCompanyInfo(userId, updateData, companyLogoUrl);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Company information updated successfully',
        data: updatedCompanyInfo
    });
});



//* -------------------------------------------------------------------------- */
//*                          API TO SUBMIT ONBOARDING                          */
//* -------------------------------------------------------------------------- */
routes.patch('/me/submit', authMiddleware, onboardingUpload, validateRequestBodyViaMiddleware(onboardingValidator), async (req: Request, res: Response) => {
    const data: ICompanyDTO = req.validatedBody;
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const files = req.files;

    console.log('Onboarding submission data:', tenantId);
    const result = await CompanyService.submitOnboarding(data, userId, tenantId, files);

    const stepMessages: Record<number, string> = {
        1: 'Company details saved successfully',
        2: 'Workflows configured successfully',
        3: 'Cost codes and workers comp files uploaded successfully',
        4: 'Expiration alerts configured successfully',
        5: 'Approval settings saved successfully',
        6: 'Onboarding completed successfully',
    };
    const responseDescription = stepMessages[data.step] ?? `Step ${data.step} saved successfully`;

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription,
        data: result
    });
});





export default routes;
