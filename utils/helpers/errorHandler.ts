import { Request, Response, NextFunction } from 'express';
import { Utils } from '../utils';
import { HttpStatusCode } from 'axios';
import colors from 'colors';
import { CustomError } from '../../core/errors/custom';
import { ValidationError } from '../../core/errors/validation';

export const ErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
    // Only log unexpected errors with full stack; avoid noisy logs for known 4xx errors
    if (err instanceof CustomError || err instanceof ValidationError) {
        // optional: downgrade log level
        console.warn(colors.yellow(`Handled error: ${err.message}`));
    } else {
        console.error(colors.blue(`Error Occurred At File: => ${err.stack}`));
    }

    if (err instanceof CustomError) {
        err.sendResponse(res);
        return;
    }

    else if (err instanceof ValidationError) {
        err.sendResponse(res);
        return;
    }

    else if (err instanceof SyntaxError && 'body' in err) {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.BadRequest,
            status: false,
            responseCode: '400',
            responseDescription: 'Malformed Request! Invalid JSON'
        });
        return;
    }

    else {
        Utils.apiResponse({
            res,
            code: HttpStatusCode.InternalServerError,
            status: false,
            responseCode: '500',
            responseDescription: 'Ops! Something went wrong. Please try again later'
        });
        return;
    }
}

export default ErrorHandler;