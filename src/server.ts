import path  from 'path'
import dayjs from 'dayjs'
import cors  from 'cors'
import http  from './http'
import { v4 as uuidv4 } from 'uuid'
import express, { Express, NextFunction } from 'express'
import { RemoteSocket, Socket, Server as SocketIOServer } from 'socket.io'
import { createServer, Server as HTTPServer } from 'http'
import { RedisClientType, createClient } from 'redis'
import { createAdapter }    from '@socket.io/redis-streams-adapter'
import { DefaultEventsMap } from 'socket.io/dist/typed-events'
import { ErrorHandler }     from './components/Error'
import bodyParser   from 'body-parser'
import TokenManager from './components/TokenManager'
const publicPath = path.join(__dirname, '../public')

// Do not remove, this is require for ErrorHandler can catch errors in async functions
require('express-async-errors')

const TManager = new TokenManager()

export class Server {
    private httpServer: HTTPServer
    private app: Express
    private io: SocketIOServer
    private redisClient: RedisClientType
    private readonly APP_PORT: number = parseInt(process.env.APP_PORT) ?? 5000
    private readonly REDIS_URL: string = process.env.REDIS_URL ?? 'redis://redis'
    private readonly events: Array<string> = [
        'auth-request',
        'room-create-request',
        'room-join-request',
        'room-join-accept',
        'room-join-reject',
        'relay-ice-candidate',
        'relay-session-description'
    ]

    /**
     * Class init method
     */
    public async initialize(): Promise<void>
    {
        this.redisClient = createClient({ url: this.REDIS_URL })
        await this.redisClient.connect()

        this.createApp()
        this.configureApp()
        this.handleSocketConnection()
    }

    /**
     * Create ws and http servers
     * @returns void
     */
    private createApp(): void
    {
        this.app = express()
        this.httpServer = createServer(this.app)
        this.io = new SocketIOServer(this.httpServer)
    }

    /**
     * Configure ws and http servers
     * @returns void
     */
    private configureApp(): void
    {

        this.io.use(this.wsAuthMiddleware)
        this.io.adapter(createAdapter(this.redisClient))
        this.app.use(cors());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(express.static(publicPath))

        this.configureRoutes()
        this.app.use(ErrorHandler); //use ErrorHandler should be after configureRoutes()
    }

    /**
     * Auth middleware for onConnect
     * @param {Socket} socket
     * @param {NextFunction} next
     * @returns void
     */
    private wsAuthMiddleware(socket: Socket, next: NextFunction): void
    {
        if (TManager.verify(socket.handshake?.auth?.token)) return next()
        socket.disconnect()
    }

    /**
     * Configure http server routes
     * @returns void
     */
    private configureRoutes(): void
    {
        Object.entries(http).forEach(([target, callback]) => {
            const [ method, path ] = target.split('::')
            this.app[method](path, callback)
        })
    }

    /**
     * Processing peer socket connection
     */
    private handleSocketConnection(): void
    {
        this.configureServerEvents()
        this.io.on('connection', (socket: Socket) => this.configureClientEvents(socket))
    }

    /**
     * Runs server port listening
     * @param {CallableFunction} callback 
     */
    public listen(callback: (port: number) => void): void
    {
        this.httpServer.listen(this.APP_PORT, () => callback(this.APP_PORT));
    }

    /**
     * Returns list of peers connected to all instances
     * @param {string} room 
     * @returns Promise<Array<string>>
     */
    private async getClusterRoomPeers(room: string = ''): Promise<Array<string>>
    {
        return (await this.io.in(room).fetchSockets()).map((peer: RemoteSocket<DefaultEventsMap, any>) => peer?.id)
    }

    /**
     * Returns list of peers info connected to all instances
     * @param {string} room 
     * @returns Promise<Record<string, any>>
     */
    private async getClusterRoomPeersInfo(room: string = ''): Promise<Record<string, any>>
    {
        const result: Record<string, any> = {};
        (await this.io.in(room).fetchSockets()).forEach((peer: RemoteSocket<DefaultEventsMap, any>) => result[peer.id] = peer?.data)
        return result
    }

    /**
     * Returns socket connected to current instance by id
     * @param {string} id 
     * @returns Socket | null
     */
    private getSocket(id: string): Socket | null
    {
        return this.io.sockets?.sockets?.get(id) ?? null
    }

    /**
     * Apply server event listeners
     * @returns void
     */
    private configureServerEvents()
    {
        this.io.of('/cluster').on('room-join-accept', data => this.roomJoinAccept(data))
    }    

    /**
     * Apply client event listeners
     * @param {Socket} socket 
     * @returns void
     */
    private configureClientEvents(socket: Socket): void
    {
        // Listen disconnecting event for notice all users in rooms
        socket?.on('disconnecting', () => this.onConnectionClose(socket))

        const events: Record<string, string> = {}
        this.events.forEach((e: string) => {
            events[e] = ('on' + e.split('-').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(''))
        })
        
        Object.entries(events).forEach(([k, v]: [string, string]) => socket.on(k, data => {
            if (k === 'auth-request') this[v].apply(this, [socket, data])
            else this.authMiddleware(socket, data, () => this[v].apply(this, [socket, data]))
        }))
    }

    /**
     * Send unauthorized response to user
     * @param {Socket} socket 
     * @returns void
     */
    private unauthorized(socket: Socket): void
    {
        this.io.to(socket.id).emit('unauthorized', { message: 'Token is not valid' })
    }

    /**
     * WS authentication middleware
     * @param {Socket} socket 
     * @param {any} data 
     * @param {CallableFunction} callback 
     * @returns void
     */
    private authMiddleware(socket: Socket, data: any, callback: CallableFunction): void
    {
        if (!data?.auth) return this.unauthorized(socket)
        const auth = TManager.resolvePayload(data?.auth)
        if (
            !auth?.socket || !auth?.exp ||
            auth?.socket !== socket?.id ||
            auth?.exp <= dayjs().unix()
        ) return this.unauthorized(socket)

        if (callback) callback()
    }

    /**
     * Calls when peer close ws connection
     * @param {Socket} socket
     * @returns void
     */
    onConnectionClose(socket: Socket): void
    {
        Array.from(socket.rooms)?.forEach((room: string) => {
            this.io.to(room).except(socket.id).emit('room-user-leave', { room: room, peer_id: socket.id, peerinfo: socket?.data?.peerinfo })
        })
    }

    /**
     * Calls when peer send auth request
     * @param {Socket} socket
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private onAuthRequest(socket: Socket, { token, payload, peerinfo }: { token: string, payload: any }): void
    {
        if (!TManager.verify(token)) {
            this.io.to(socket.id).emit('auth-reject', { message: 'Token is not valid', payload: payload })
            return
        }

        if (peerinfo) socket.data = { peerinfo }
        const exp = parseInt(process.env.TOKEN_LIFETIME) || (60 * 60 * 24)
        this.io.to(socket.id).emit('auth-accept', {
            payload,
            token: TManager.createToken({
                app: TManager.getAppName(token),
                exp: dayjs().add(exp, 'second').unix(),
                socket: socket.id,
            })
        })
    }

    /**
     * Calls when room owner accept request
     * @param {Record<string, string>} data
     * @returns Promise<void>
     */
    private async roomJoinAccept({ peer_id, room, payload }: { peer_id: string, room: string, payload: any }): Promise<void>
    {
        const socket: Socket | null = this.getSocket(peer_id)
        // If peer socket it not on current cluster node, just do nothing
        if (!socket) return
        socket.join(room)

        // Get all peers id from passed room
        const peers = await this.getClusterRoomPeersInfo(room)

        // Notice user about he was join to created room
        this.io.to(peer_id).emit('room-join-accept', {
            room:      room,
            peer_id:   peer_id,
            peers:     Object.keys(peers).filter(p => p !== peer_id),
            peersinfo: peers,
            payload:   payload
        })
        // Notice other users in room about new user was doin to room
        this.io.to(room).except(peer_id).emit('room-user-join', { room: room, peer_id: peer_id, payload, peerinfo: socket?.data?.peerinfo })
    }

    /**
     * Calls when peer send ICE Candidate to server
     * @param {Socket} socket 
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private onRelayIceCandidate(socket: Socket, { to, room, ice_candidate, payload }): void
    {
        this.io.to(to).emit('ice-candidate', { 'peer_id': socket.id, ice_candidate, room, payload })
    }

    /**
     * Calls when peer send his SessiongDescription to server
     * @param {Socket} socket 
     * @param Record<string, any> data
     */    
    //@ts-expect-error
    private onRelaySessionDescription(socket: Socket, { to, session_description, room, payload }): void
    {
        this.io.to(to).emit('session-description', { peer_id: socket.id, session_description, room, payload })
    }

    /**
     * Calls when peer send request to create new room
     * @param {Socket} socket 
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private async onRoomCreateRequest(socket: Socket, { room, payload }: { room: string, payload: any }): void
    {
        if (!room) room = uuidv4() // Create room name if it is not passed
                
        // Check existing room with passed name
        const peers = await this.getClusterRoomPeers(room)

        // If room already exist - send user reject answer
        if (peers && peers.length) {
            socket.emit('room-create-reject', {
                payload,
                message: 'Room already taken someone else. Please type another room name or stay it blank.'
            })
            return
        }
        
        socket.join(room) // Join current peer to room
        socket.join(`${room}-owners`) // Join current peer to owner room
        socket.emit('room-create-accept', { room, payload }) // Notice user about room was created
    }

    /**
     * Calls when peer send request to join to room
     * @param {Socket} socket 
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private async onRoomJoinRequest(socket: Socket,  { room, payload }: { room: string, payload: any }): void
    {
        if (!room) return

        // Check existing room with passed name
        const peers = await this.getClusterRoomPeers(room)
        // If room is not exist
        if (!peers || !peers.length) {
            socket.emit('room-join-reject', { message: 'Room is not found.', payload })
            return
        }

        this.io.in(`${room}-owners`).except(socket.id).emit('room-join-request', { room: room, peer_id: socket.id, payload, peerinfo: socket?.data?.peerinfo })
    }

    /**
     * Calls when room ower was reject join request
     * @param {Socket} _socket
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private onRoomJoinReject(_socket: Socket, { room, peer_id, to, payload })
    {
        this.io.to(peer_id).emit('room-join-reject', { room: room, peer_id: peer_id, message: 'Room owner was rejected your request', payload})
    }

    /**
     * Calls when room ower was accept join request
     * @param {Socket} _socket
     * @param Record<string, any> data
     * @returns void
     */
    //@ts-expect-error
    private onRoomJoinAccept(_socket: Socket, { peer_id, room, payload})
    {
        // Join user socket to room
        this.roomJoinAccept({ peer_id, room, payload })
        this.io.of('/cluster').serverSideEmit('room-join-accept', { peer_id, room, payload })
    }
}
