import { HttpStatusCode } from 'axios';
import { NextFunction, Request, Response } from 'express';
import { CustomError } from '../core/errors/custom';
import UserRoles from '../core/enums/userRoles';

const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
    const hasPlatformAccess = [UserRoles.PLATFORMADMIN, UserRoles.SUPERADMIN].includes(
        req.user?.role as UserRoles
    );

    if (!hasPlatformAccess) {
        throw new CustomError(HttpStatusCode.Forbidden, 'Platform Admin access required');
    }

    next();
};

export default requireSuperAdmin;
