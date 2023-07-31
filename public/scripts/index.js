
document.addEventListener('DOMContentLoaded', () => initChat())

// example payload
const MessagePayload  = {
    foo: 'bar'
}

const initChat = () => {
    const localVideo  = document.querySelector('#local-video'),
        usersList     = document.querySelector('#users-list'),
        audioSelect   = document.querySelector('#audioSource'),
        videoSelect   = document.querySelector('#videoSource'),
        roomNameInput = document.querySelector('#roomName'),
        buttonJoin    = document.querySelector('#buttonJoin'),
        buttonCreate  = document.querySelector('#buttonCreate'),
        localVideoTitle = document.querySelector('#local-video-title'),
        iceConfig = window.env.iceConfig

    const onDeviceListChange = ({ videoDevices, audioDevices, audioSelect, videoSelect }) => {
        if (audioDevices && audioDevices.length) audioDevices.forEach(d => {
            const option = document.createElement('option')
            option.value = d.deviceId
            option.text  = d.label || `Microphone ${audioDevices.length + 1}`
            audioSelect.appendChild(option)
        })

        if (videoDevices && videoDevices.length) videoDevices.forEach(d => {
            const option = document.createElement('option')
            option.value = d.deviceId
            option.text  = d.label || `Camera ${videoDevices.length + 1}`
            videoSelect.appendChild(option)
        })
    }

    videoSelect.onchange = () => window?.chat.restartStream()
    audioSelect.onchange = () => window?.chat.restartStream()
    buttonJoin.onclick   = () => window?.signal.join(roomNameInput.value)
    buttonCreate.onclick = () => window?.signal.create(roomNameInput.value)

    const observer = new MutationObserver(() => {
        if (Array.from(usersList.childNodes).length) usersList.classList.add('active')
        else usersList.classList.remove('active')
    });
    observer.observe(usersList, { childList: true, attributes: false, subtree: true });
    
    window.signal = new Signal({
        url: 'document.location.host',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkZW1vLWNoYXQifQ==.ffa9cd61db2383ad80c79fd3e6fdef97abd4c028b22647cde179edf1aee71ebb'
    })
    window.chat = new Chat({
        iceConfig, getSources: () => ({ audio: audioSelect.value, video: videoSelect.value }) // get selected user devices (camera and mic)
    });

    window.signal.on('connect', () => {
        localVideoTitle.innerHTML = `Your id is "${window.signal.getId()}"`
        window.chat.init()
        // window.chat.on('ready', () => window.signal.join(roomName))
    })

    window.signal.on('disconnect', () => alert('You has been disconnected. Check your token.'))

    window.signal.on('room-created', () => alert('Room successfully created, awaiting other users...'))
    window.signal.on('room-rejected', data => alert(data.message))
    window.signal.on('auth-rejected', data => alert(data.message))
    window.signal.on('join-reject', data => alert(data.message))
    window.signal.on('unauthorized',  data => alert(data.message))

    window.signal.on('room-user-join', (data) => {
        if (!data) return
        window.chat.addPeer(data.peer_id, data.room)
    })

    window.signal.on('room-joined', (data) => {
        if (!data) return
        window.chat.connectToPeers(data)
    })

    window.chat.on('update-stream', (stream) => {
        window.stream = stream; // make stream available to console
        localVideo.srcObject = stream // set local stream to video tag. just for preview user stream
    })

    window.chat.on('remove-peer', ({ peer, room }) => {
        const RemoteMediaBox = document.querySelector(`#peer-${peer}`)
        if (!RemoteMediaBox) return
        RemoteMediaBox.parentNode.removeChild(RemoteMediaBox)
    })

    window.chat.on('create-peer', ({ stream, peer }) => {
        const RemoteMediaBox = document.createElement('div')
        const RemoteMediaTitle = document.createElement('span')
        const RemoteMedia = document.createElement('video')

        RemoteMediaTitle.innerHTML = `peer id: ${peer}`
        RemoteMediaTitle.classList.add('video-title')
        
        RemoteMediaBox.classList.add('video-box')
        RemoteMediaBox.setAttribute("id", `peer-${peer}`)

        RemoteMedia.setAttribute("autoplay", "autoplay")
        RemoteMedia.setAttribute("controls", "")
        RemoteMedia.srcObject = stream

        RemoteMedia.addEventListener("loadedmetadata", () => RemoteMedia.play());

        RemoteMediaBox.append(RemoteMediaTitle)
        RemoteMediaBox.append(RemoteMedia)
        usersList.append(RemoteMediaBox)
    })

    // calls when chat find new connected devices
    window.chat.on('update-devices', devices => onDeviceListChange({...devices, audioSelect, videoSelect }))

    window.signal.init()
}


class Signal {

    url    = null
    token  = null
    socket = null
    room   = null
    authToken = null

    eventListeners = {}

    constructor ({ url, token}) {
        this.url = url
        this.token = token
    }

    init() {
        const socket = io({
            transports: ["websocket"],
            auth: {
                token: this.token
            }            
        });
        this.socket = socket.connect(this.url)
        this.listen()
    }

    on(event, callback) {
        if (!this.eventListeners[event]) this.eventListeners[event] = []
        this.eventListeners[event].push(callback)
    }

    emit(event, data) {
        if (!this.eventListeners[event]) return
        this.eventListeners[event].forEach(cb => cb(data))
    }

    emitSocket(event, data) {
        return this.socket.emit(event, { ...data, auth: this.authToken });
    }

    getId() {
        return this.socket?.id
    }

    listen() {
        this.socket.on('connect',      data => this.onConnect(data))
        this.socket.on('disconnect',   data => this.onDisconnect(data))
        this.socket.on('unauthorized', data => this.onUnauthorized(data))
        this.socket.on('auth-accept',  data => this.onAuthAccept(data))
        this.socket.on('auth-reject',  data => this.onAuthReject(data))

        this.socket.on('ice-candidate',  data => this.onIceCandidate(data))
        this.socket.on('session-description', data => this.onSessionDescription(data))

        this.socket.on('room-create-accept', data => this.onRoomCreateAccept(data))
        this.socket.on('room-create-reject', data => this.onRoomCreateReject(data))
        
        this.socket.on('room-join-request', data => this.onRoomJoinRequest(data))
        this.socket.on('room-join-accept',  data => this.onRoomJoinAccept(data))
        this.socket.on('room-join-reject',  data => this.onRoomJoinReject(data))

        this.socket.on('room-user-join', data => this.onRoomUserJoin(data))
    }

    auth() {
        this.socket.emit('auth-request', { token: this.token, payload: MessagePayload });
    }

    onAuthAccept(data) {
        this.authToken = data.token
        this.emit('auth-accepted', data)
    }

    onAuthReject(data) {
        this.emit('auth-rejected', data)
    }

    create(room) {
        this.emitSocket('room-create-request', { room, payload: MessagePayload })
    }

    join(room) {
        this.emitSocket('room-join-request', { room, payload: MessagePayload })
    }

    onSessionDescription(data) {
        window.chat.addSessionDescription(data)
    }
    
    onIceCandidate(data) {
        window.chat.addIceCandidate(data)
    }

    onConnect(data) {
        this.auth()
        this.emit('connect', data)
    }

    onDisconnect(data) {
        this.emit('disconnect', data)
    }

    onUnauthorized(data) {
        this.emit('unauthorized', data)
    }

    onRoomCreateAccept(data) {
        this.emit('room-created', data)
    }

    onRoomCreateReject(data) {
        this.emit('room-rejected', data)
    }

    onRoomJoinRequest({ peer_id, room }) {
        if (confirm(`User ${peer_id} wants to join this room. Accept it?`))
            this.emitSocket('room-join-accept', { peer_id: peer_id, to: peer_id, room, payload: MessagePayload })
        else this.emitSocket('room-join-reject', { peer_id: peer_id, to: peer_id, room, payload: MessagePayload })
    }

    onRoomJoinAccept(data) {
        this.emit('room-joined', data)
    }

    onRoomJoinReject(data) {
        this.emit('join-reject', data)
    }

    onRoomUserJoin(data) {
        this.emit('room-user-join', data)
    }
}

class Chat {

    eventListeners = {} // Chat event listeners
    iceConfig = {}      // ICE config to connect to STUN and TURN servers
    stream = null       // Local user MediaStream
    peers  = {}         // List of RTCPeerConnection with all peers
    getSources = null   // Callback for getting selected user media devices

    constructor({ iceConfig = {}, getSources }) {
        this.iceConfig  = iceConfig
        this.getSources = getSources
    }

    /**
     * Init class
     * @returns Promise<void>
     */
    async init() {
        await this.getLocalDevices()
        await this.restartStream()
        this.emit('ready')
    }

    /**
     * Add new event listener
     * @param string event
     * @param CallableFunction callback
     * @returns void
     */
    on(event, callback) {
        if (!this.eventListeners[event]) this.eventListeners[event] = []
        this.eventListeners[event].push(callback)
    }

    /**
     * Fire new event
     * @param string event 
     * @param any data 
     * @returns void
     */
    emit(event, data) {
        if (!this.eventListeners[event]) return
        this.eventListeners[event].forEach(cb => cb(data))
    }    

    e(e) {
        this.error(e.message, e)
    }

    error(message, error) {
        console.warn('[Chat error]: ', message, error)
    }

    /**
     * Returns user media devices
     * @returns Promise<Record<string, Array<InputDeviceInfo>>>
     */
    async getLocalDevices() {
        const info = await navigator.mediaDevices.enumerateDevices()
        const devices = {
            audioDevices: info.filter(d => d.kind === 'audioinput'),
            videoDevices: info.filter(d => d.kind === 'videoinput')
        }
        this.emit('update-devices', devices)
        return devices
    }

    /**
     * Getting MediaStream from user devices and return it
     * @returns Promise<MediaStream>
     */
    async getStream(flush = false) {
        // get audio and video inputs values
        const { audio, video } = this.getSources(), constraints = {}

        if (audio) constraints.audio = { deviceId:  { exact: audio } }
        if (video) constraints.video = { deviceId:  { exact: video } }

        // get audio + video stream from user devices
        const stream = await navigator?.mediaDevices.getUserMedia(constraints).catch(e => this.e(e)) ?? null
        // if stream is not extist just set stream
        if (!this.stream) this.stream = stream ?? null
        // if stream already exist we can't just replace it - this is will break RTCStream
        // we need find and replace video and audio tracks in stream senders, so just do it
        else {
            // Get old tracks from current stream, stop them and remove
            this.stream.getTracks().forEach(track => {
                track.stop()
                this.stream.removeTrack(track)
            });
            // add audio and video tracks from new stream to old stream
            stream.getTracks().forEach(track => this.stream.addTrack(track))
        }

        return this.stream
    }

    /**
     * Restart local stream and update stream in RTCPeerConnection
     * @returns MediaStream
     */
    async restartStream(flush = false) {
        await this.getStream(flush)
        if (!this.stream) return
        this.emit('update-stream', this.stream)

        // Get video and audio tracks from new updated stream
        const [audioTrack] = this.stream.getAudioTracks()
        const [videoTrack] = this.stream.getVideoTracks()

        // update tracks in each peer sender
        Object.values(this.peers).forEach(peer => {
            peer.getSenders().forEach(sender => {
                if (sender.track.kind === 'audio') sender.replaceTrack(audioTrack)
                if (sender.track.kind === 'video') sender.replaceTrack(videoTrack)
            })
        })

        return this.stream
    }

    /**
     * Add ice candidate to RTC Peer
     * @param data - Object of peer_id and ice_candidate
     * @returns void
     */
    addIceCandidate({ peer_id, ice_candidate }) {
        const peer = this.getPeer(peer_id)
        if (!peer) return
        peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
    }

    /**
     * Add remote session description to RTC Peer
     * @param data - Object of peer_id, session_description and room
     * @returns 
     */
    async addSessionDescription({ peer_id, session_description, room }) {
        const peer = this.getPeer(peer_id)
        if (!peer) return
        
        await peer.setRemoteDescription(new RTCSessionDescription(session_description)).catch(e => this.e(e))
        if (session_description.type == "offer") this.answerSessionDescription({ peer, peer_id, room })
    }

    /**
     * Send RTCSessionDescription answer to RTC Peer over signalling server
     * @param Promise<void>
     */
    async answerSessionDescription({ peer, peer_id, room }) {
        const answer = await peer.createAnswer().catch(e => this.e(e))
        const local_description = new RTCSessionDescription(answer);
        await peer.setLocalDescription(local_description).catch(e => this.e(e))
        window.signal.emitSocket('relay-session-description',  {'peer_id': peer_id, to: peer_id, room: room, 'session_description': local_description, payload: MessagePayload })
    }

    /**
     * Returns RTCPeerConnection by id
     * @param string id 
     * @returns RTCPeerConnection
     */
    getPeer(id) {
        return this.peers[id]
    }

    /**
     * Close RTCPeerConnection by id
     * @param string id 
     * @param string room 
     * @returns void
     */
    closePeer(id, room) {
        const peer = this.getPeer(id)
        if (!peer) return
        peer.close()
        delete this.peers[id]
        this.emit('remove-peer', ({ peer: id, room }))
    }

    /**
     * Open new RTCPeerConnection connection with peer
     * @param string id 
     * @param string room 
     * @returns RTCPeerConnection
     */
    addPeer(id, room) {
        if (this.peers[id]) return this.peers[id]
        const peer = new RTCPeerConnection(this.iceConfig, {"optional": [{"DtlsSrtpKeyAgreement": true}]})
        this.peers[id] = peer

        // When remote user start stream emit event about it to add his stream to page
        peer.onaddstream = (e) => this.emit('create-peer', { stream: e.stream, peer: id })

        // Listen state changes of RTCPeerConnection and close it if user was disconnected
        peer.onconnectionstatechange  = (e) => {
            if (peer.connectionState === 'disconnected') this.closePeer(id, room)
        }
        
        this.stream.getTracks().forEach(track => peer.addTrack(track, this.stream))

        // This is required, because when at least one user have no video all stream will use only audio
        // so we need force set config - we have video stream
        peer.addTransceiver('video')
        peer.addTransceiver('audio')
        
        // peer.ontrack = (event) => {} // I was use 'onaddstream' instead 'onaddstream'
        // Called when user successfully received his network device info to connect over RTC
        // Then we should send event with this info to remote user, so we call 'relay-ice-candidate' event
        peer.onicecandidate = event => {
            if (!event.candidate) return
            window.signal.emitSocket('relay-ice-candidate', {
                to: id, // User who will receive our event
                room: room,
                peer_id: id, 
                ice_candidate: {
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    candidate:     event.candidate.candidate
                },
                payload: MessagePayload
            })
        }

        return this.peers[id]
    }

    /**
     * Opens RTCPeerConnection with passed peers
     * @param { room: string, peers: Array<RTCPeerConnection> } data - Object with peer list and room
     * @returns void
     */
    connectToPeers({ room, peers }) {
        peers.forEach(peer => this.connectToPeer(peer, room))
    }

    /**
     * Opens RTCPeerConnection with passed peer
     * @param string id 
     * @param string room 
     */
    async connectToPeer(id, room) {
        const peer  = this.addPeer(id, room)
        const offer = await peer.createOffer().catch(e => this.e(e))
        await peer.setLocalDescription(offer).catch(e => this.e(e))
        window.signal.emitSocket('relay-session-description', {peer_id: id, room: room, session_description: offer, to: id, payload: MessagePayload})
    }
}