import { HttpStatusCode } from 'axios';
import { NextFunction, Request, Response } from 'express';
import UserRoles from '../core/enums/userRoles';
import { CustomError } from '../core/errors/custom';

const requireTenantAdmin = (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== UserRoles.ADMIN) {
        throw new CustomError(HttpStatusCode.Forbidden, 'Tenant Admin access required');
    }

    next();
};

export default requireTenantAdmin;
