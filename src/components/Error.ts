import {Request, Response, NextFunction} from 'express';

/**
 * Class for work with Error and HTTP API
 */
export class AppError extends Error {
    public statusCode: number = 200
    public message: string

    constructor(statusCode: number, message: string) {
        super();
        this.statusCode = (statusCode) ? statusCode : 500;
        this.message = message;
    }
}

/**
 * Error handler for AppError, convert Error to HTTP reponse by defined structure
 * 
 * @param {AppError} err
 * @param {Request}  req
 * @param {Response} res
 * @param {NextFunction} next
 * @returns 
 */
export const ErrorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
    let { statusCode, message } = err;
    if (!statusCode) statusCode = 500;
    return res.status(statusCode).json({
        status: statusCode,
        error: message,
        response: false
    });
}