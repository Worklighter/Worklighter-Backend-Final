import FillableField from "../../core/interfaces/fillableFields"
import { GeneralFillables } from "../../core/interfaces/generalInterface"

export interface IRoles {
    _id: string,
    name: string,
    slug: string,
    permissions: MenuStructure[],
    createdAt: string,
    updatedAt: string,
    createdBy: string,
    updatedBy: string,
    deletedAt: string
}



export interface MenuStructure {
    menuSlug: string,
    menuUri: string,
    menuPermissions: MenuPermissionsStructure[]
}


export interface MenuPermissionsStructure {
    permissionSlug: string,
    apiSlug: string
}


export const RoleFillableFields: FillableField[] = [
    { column: 'name', columnDataType: 'string' },
    { column: 'slug', columnDataType: 'string' },
    { column: 'permissions', columnDataType: 'array' },
    ...GeneralFillables
]


export interface IListRolesDTO {
    searchText: string,
    fields: string
}


export interface IAssignPermissionsToRoleDTO {
    roleId: string,
    permissions: {
        menuSlug: string,
        permissions: string[]
    }[]
}

export const optimizedRoleResponseFields = [
    '_id',
    'name',
    'slug',
    'permissions'
]