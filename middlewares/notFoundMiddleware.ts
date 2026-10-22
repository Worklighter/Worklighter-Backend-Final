import { Request, Response, NextFunction } from 'express';
import { HttpStatusCode } from 'axios';
import { Utils } from '../utils/utils';

export const notFoundMiddleware = (req: Request, res: Response, next: NextFunction) => {
  Utils.apiResponse({
    res,
    code: HttpStatusCode.NotFound,
    status: false,
    responseCode: '404',
    responseDescription: 'The requested resource could not be found on this server',
  });
};