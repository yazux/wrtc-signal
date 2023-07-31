import crypto from 'crypto'

export interface TokenPayload {
    app?: string
    socket?: string
    exp?: number
}

export interface TokenParsed {
    head:      string
    payload:   string
    signature: string
}

/**
 * JWT Token manager
 */
class TokenManager {

    /**
     * Checks token is valid and returns auth result
     * 
     * @param {string} token - user token
     * @returns boolean
     */
    verify(token: string): boolean
    {
        const payload: TokenPayload | undefined = this.resolvePayload(token)
        if (!payload || !token) return false
        return this.createToken(payload) === token
    }

    /**
     * Parsing token from token
     * 
     * @param {string} token - token string
     * @returns TokenPayload | undefined
     */
    resolvePayload(token: string): TokenPayload | undefined
    {
        let parsed: TokenParsed | undefined = this.parse(token)
        if (!parsed?.payload) return undefined

        const payload: TokenPayload = JSON.parse(Buffer.from(parsed.payload, 'base64').toString('utf8'))
        if (!payload?.app) return undefined

        return payload
    }    

    /**
     * Parsing app name
     * 
     * @param {string} token - token string
     * @returns string | undefined
     */
    getAppName(token: string): string | undefined
    {
        const payload = this.resolvePayload(token)
        if (!payload?.app) return undefined

        return payload.app;
    }

    /**
     * Parsing socket id
     * 
     * @param {string} token - token string
     * @returns string | undefined
     */
    getSocketId(token: string): string | undefined
    {
        const payload = this.resolvePayload(token)
        if (!payload?.socket) return undefined

        return payload.socket;
    }    

    /**
     * Parsing token string to token Object
     * 
     * @param {string} token - токен в виде строки
     * @returns TokenParsed | undefined
     */
    parse(token: string): TokenParsed | undefined
    {
        let pieces: Array<string> = String(token).split('.')
        if (pieces.length !== 3) return undefined

        return {
            head:      pieces[0],
            payload:   pieces[1],
            signature: pieces[2]
        }
    }

    /**
     * Makes token by app name
     * 
     * @param {Record<string, any>} data
     * @returns string
     */
    createToken(data: Record<string, any>): string
    {
        const Head: string = this.createTokenHead(), Payload: string = this.createTokenPayload(data)
        return [Head, Payload, this.createTokenSignatire(Head, Payload)].join('.')
    }
    
    /**
     * Generate token Head
     * 
     * @returns string
     */
    createTokenHead(): string
    {
        return Buffer.from( JSON.stringify({'alg': 'HS256', 'typ': 'JWT'}) ).toString('base64')
    }

    /**
     * Generate token Payload
     * 
     * @param {Record<string, any>} data
     * @returns string
     */
    createTokenPayload(data: Record<string, any>): string
    {
        return Buffer.from( JSON.stringify(data) ).toString('base64')
    }

    /**
     * Generate token Signature
     * 
     * @param {string} Head    - Token Head
     * @param {string} Payload - Token Payload
     * @returns string
     */
    createTokenSignatire(Head = '', Payload = ''): string
    {
        const hmac = crypto.createHmac('sha256', process.env.APP_SECRET)
        const data = hmac.update([Head, Payload].join(''))
        return data.digest('hex')
    }
}

export default TokenManager