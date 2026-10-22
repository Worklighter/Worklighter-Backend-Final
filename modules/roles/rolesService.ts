import { HttpStatusCode } from "axios";
import QueryOperators from "../../core/enums/queryOperators";
import { Utils } from "../../utils/utils";
import QueryOperationTypes from "../../core/enums/queryOperationTypes";
import UserRoles from "../../core/enums/userRoles";
import { ObjectId } from "mongodb";
// import { IPermissions } from "../permissions/permissionsInterface";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
// import PermissionsRepository from "../permissions/permissionsRepository";
import { IListRolesDTO, optimizedRoleResponseFields, IRoles, IAssignPermissionsToRoleDTO } from "./rolesInterface";
import RolesRepository from "./rolesRepositories";

class PermissionsService {

    /*
    * ╔══════════════════════════════════════╗
    * ║           PROTECTED METHODS          ║
    * ╚══════════════════════════════════════╝
    */

    protected attachMetaData(data: Partial<any>, loggedInUser: any) {
        data.slug = Utils.generateSlug(data.name);
        data.createdAt = Utils.getCurrentDate();
        data.createdBy = loggedInUser._id;
    }

    /*
    * ╔═══════════════════════════════════╗
    * ║           PUBLIC METHODS          ║
    * ╚═══════════════════════════════════╝
    */

    public async listRoles(data: IListRolesDTO, loggedInUser: IJWTPayload) {
        // With only USER and SUPERADMIN roles, we don't need to exclude anything special
        const getRolesConditions: any = [
            ...(data.searchText
                ? [{
                    param: 'name',
                    value: data.searchText,
                    operator: QueryOperators.AND,
                    operationType: QueryOperationTypes.CONTAINS
                }]
                : [])
        ];

        const columnsToRetrieve: string[] = data.fields.length ? data.fields.split(',') : optimizedRoleResponseFields;
        const roles: Partial<IRoles>[] = await RolesRepository.getInstance().GetAll(
            getRolesConditions,
            false,
            null,
            0,
            { createdAt: 1 },
            columnsToRetrieve
        );
        return { roles };
    }

    public async assignPermissionsToRole(data: IAssignPermissionsToRoleDTO, loggedInUser: IJWTPayload) {
        const countRoleConditions: any = [
            {
                param: '_id',
                value: new ObjectId(data.roleId),
                operator: QueryOperators.AND
            }
        ];

        const role = await RolesRepository.getInstance().Count(countRoleConditions);

        if (!role) throw new CustomError(HttpStatusCode.NotFound, 'Role not found');

        const getPermissions: Record<string, any> = await this.retrievePermissions({ permissions: data.permissions });

        const dataToUpdate: Partial<IRoles> = {
            permissions: getPermissions?.permissions || []
        };

        return RolesRepository.getInstance().Update(new ObjectId(data.roleId), dataToUpdate, optimizedRoleResponseFields);
    }

    public async getPermissionsByRoleName(roleName: string) {
        return RolesRepository.getInstance().GetOneByParam({ param: 'name', value: roleName }, ['permissions']);
    }

    /*
    * ╔═══════════════════════════════════╗
    * ║           PRIVATE METHODS         ║
    * ╚═══════════════════════════════════╝
    */

    private async retrievePermissions(requestedPermissions: any) {
        // Permissions feature is effectively disabled for now
        return { permissions: [] };
    }

}

export default new PermissionsService();
