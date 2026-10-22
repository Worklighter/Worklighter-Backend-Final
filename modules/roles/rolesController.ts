import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import RolesService from './rolesService';
import { IListRolesDTO, IAssignPermissionsToRoleDTO } from './rolesInterface';
import { listRolesValidator, assignPermissionsToRoleParamValidator, assignPermissionsToRoleBodyValidator } from './rolesValidator';
const routes = express.Router();


//* API TO LIST ROLES
routes.get('/', authMiddleware, validateRequestQueryViaMiddleware(listRolesValidator), async (req: Request, res: Response) => {
    const data: IListRolesDTO = {
        searchText: req.validatedQuery?.searchText || null,
        fields: req.validatedQuery?.fields || ''
    }
    const result = await RolesService.listRoles(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: result.roles.length ? 'Roles fetched successfully' : 'No roles found',
        data: result
    });
});


//* API TO ASSIGN PERMISSIONS TO ROLE
routes.post('/:roleId/permissions', authMiddleware, validateRequestParamsViaMiddleware(assignPermissionsToRoleParamValidator), validateRequestBodyViaMiddleware(assignPermissionsToRoleBodyValidator), async (req: Request, res: Response) => {
    const data: IAssignPermissionsToRoleDTO = {
        roleId: req.validatedParams?.roleId,
        permissions: req.validatedBody?.permissions
    }
    const result = await RolesService.assignPermissionsToRole(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Permissions updated successfully',
        data: result
    });
});


export default routes;