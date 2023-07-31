import { ExpressRequest } from "./types";
import { AppError } from './components/Error'
import { Response } from 'express'
import path from 'path'
import TokenManager from './components/TokenManager'

const publicPath = path.join(__dirname, '../public')

const http: Record<string, CallableFunction> = {
    'get::/': () => {
        throw new AppError(401, 'Unauthorized')
    },
    'get::/demo': (_req: ExpressRequest, res: Response) => {
        return res.sendFile('/demo.html', { root: publicPath  })
    },
    'post::/app': (req: ExpressRequest<{ app: string, password: string }>, res: Response) => {
        if (req.body?.password !== process.env?.APP_PASS) throw new AppError(401, 'Unauthorized');
        if (!req.body.app) throw new AppError(400, 'Required properties (app) is undefined');

        return res.send({
            status: 200,
            error: null,
            response: {
                token: (new TokenManager()).createToken({ app: req.body.app })
            }
        })
    }
}

export default http