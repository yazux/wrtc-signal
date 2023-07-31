import { Request } from "express"

export interface ExpressRequest<T = void> extends Request {
    body: T
}