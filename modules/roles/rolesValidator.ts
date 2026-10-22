import Joi from 'joi';
import { idsValidator, rolePermissionValidator } from '../../core/validators/generalValidators';




export const listRolesValidator = Joi.object().keys({
    searchText: Joi.string().optional().allow('').label('Search Text'),
    fields: Joi.string().trim().optional().allow('').label('Fields'),
});



export const assignPermissionsToRoleParamValidator = Joi.object().keys({
    roleId: idsValidator.required().label('Role ID'),
});



export const assignPermissionsToRoleBodyValidator = Joi.object().keys({
    //* CAN ADD A CONSTRAINT min(1) TO ENSURE AT LEAST ONE PERMISSION IS SELECTED
    permissions: Joi.array().items(rolePermissionValidator).required().label('Permissions')
});