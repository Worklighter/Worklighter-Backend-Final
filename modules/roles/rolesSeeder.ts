import UserRoles from "../../core/enums/userRoles";
import { IRoles } from "./rolesInterface";



export const RolesSeed: Partial<IRoles>[] = [
    {
        name: UserRoles.ADMIN,
        slug: UserRoles.ADMIN,
        permissions: []
    },
    {
        name: UserRoles.SUPERADMIN,
        slug: UserRoles.SUPERADMIN,
        permissions: []
    },
    {
        name: UserRoles.PLATFORMADMIN,
        slug: UserRoles.PLATFORMADMIN,
        permissions: []
    },
    {
        name: UserRoles.PROJECTMANAGER,
        slug: UserRoles.PROJECTMANAGER,
        permissions: []
    },
]
