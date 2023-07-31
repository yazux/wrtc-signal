# Chat Signal server

Supports signal layer and http api for authentication.

## Requirements

- Linux (Ubuntu 18.04 or analogs)
- nginx
- Redis
- Node.js 18
- npm 9.7.2
- SSL
- Configure nginx for correctly working with WebSockets
- Setup environment variables
- Docker, docker-compose (optional)
- Socket.io client (for client app)

## Commands

```
# No watching mode
npm run run

# Production mode with Docker
npm run prod

# Production mode with pm2, multithreading mode (do not user with Docker)
npm run pm-start

# Stop app (Production mode with pm2)
npm run pm-stop

# Restart app (Production mode with pm2)
npm run pm-restart

# Run with docker
docker-compose -p demo -f docker/demo/docker-compose.yml up -d --build

```

## How to run

- Clone project from git or download archive
- Configure nginx for correctly working with HTTP and WebSockets
- Install node.js and npm
- Run command `npm install`
- Run app with one of commands
- Create app token with HTTP POST request /app
- Make WebSocket connection with server
- Send auth WebSocket request and get token
- Then use this token you can subscribe on events and send messages to server or use /demo page


## Endpoints

### HTTP: https://domain-name.com

### WebSocket: wss://domain-name.com/socket.io

## API

### HTTP

- **POST /app** - Adding application and receiving app token
> This is forever lifetime token for one application. For example if you want use signal server from mobile app and web frontend you should get two tokens. First - for mobile app, second - for frontend web app. Do not call it every time for every connection.

Parameters:

| Name     | Type     | Require | Default value | description      |
| -------- | -------- | ------- | ------------- | ---------------- |
| app      | String   | Yes     | Null          | App name         |
| password | String   | Yes     | Null          | Backend password |

    
Response example
```json
{
    "status": 200,
    "error": null,
    "response": {
        "token": "eyJh24gfb6bGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHAiO2f5iJkZW1sc32fvLWNo21cwsYXQifQ==.ffa9cd61db2383ad8bj850c79fd3e6fdef9da7abd4c028b22647cd312e179edf1aee71ebb"
    }
}
```


### WebSocket


> Example with socket.io

```JavaScript
const token = 'type your token from POST /app request' // app token
let sessionToken = null; // user session token
// create io object
const socket = io({
    transports: ["websocket"],
    auth: {
        token: token
    }            
})
// try to connect
const socket = socket.connect(this.url)
socket.on('connect', () => {
    // sending auth request with token
    socket.emit('auth-request', token)

    // listens auth accepted message
    socket.on('auth-accept', data => {
        // save user session token
        sessionToken = data.token

        // then you can send message to server
        socket.emit('room-create-request', { room: 'your room name', auth: sessionToken })
    })

    // listens auth rejected message
    socket.on('auth-reject', data => {
        alert(data.message)
    })
})

```

> Also you can use native JavaScript or another clients. But you should be sure your websocket messages is right. Socket.io are use numeric prefix for all messages in connection (you can read about it on socket.io protocol page).

See more information about it here:
- [socket.io-protocol](https://github.com/socketio/socket.io-protocol)
- [engine.io-protocol](https://github.com/socketio/engine.io-protocol)
- [Stackoverflow discussion](https://stackoverflow.com/questions/24564877/what-do-these-numbers-mean-in-socket-io-payload)


### Emits (ws messages emits from client)

> In any emit you can send `payload` field, it will be send to related events. You can use this mechanism for transfer additional data between users over signal server. But don't abuse it, a long `payload` data will be rejected. Do not send secret data (tokens, passwords and another) over this method, only public data between roomates.

For example:
```JavaScript
# Local user send join room request
socket.emit('room-join-request', { room: 'test-room', auth: sessionToken, payload: { user_login: 'foo' } })

# Room owner listen this event
socket.on('room-join-request', data => console.log(data))
/* output:
    {
        room: 'test-room',
        payload: { user_login: 'foo' }
    }
*/
```

### - auth-request
> Dispatched when user wants to auth his ws session

Parameters:

| Name  | Type     | Require | Default value | description |
| ----- | -------- | ------- | ------------- | ----------- |
| token | String   | Yes     | Null          | App token   |

Example
```JavaScript
socket.emit('auth-request', { token: sessionToken })
```

### - room-create-request
> Dispatched when user wants to create a new room

Parameters:

| Name     | Type     | Require | Default value | description         |
| -------- | -------- | ------- | ------------- | ------------------- |
| auth     | String   | Yes     | Null          | User Auth token     |
| room     | String   | No      | uuid          | Room name to create |

Example
```JavaScript
socket.emit('room-create-request', { room: 'test-room', auth: sessionToken })
```

---

### - room-join-request
> Dispatched when user wants to join to existing room

Parameters:

| Name     | Type     | Require | Default value | description       |
| -------- | -------- | ------- | ------------- | ----------------- |
| auth     | String   | Yes     | Null          | User Auth token   |
| room     | String   | Yes     | Null          | Room name to join |

Example
```JavaScript
socket.emit('room-join-request', { room: 'test-room', auth: sessionToken })
```

---

### - room-join-accept
> Dispatched when room owner accept user (candidate) join request

Parameters:

| Name     | Type     | Require | Default value | description              |
| -------- | -------- | ------- | ------------- | ------------------------ |
| auth     | String   | Yes     | Null          | User Auth token          |
| room     | String   | Yes     | Null          | Room name to join        |
| peer_id  | String   | Yes     | Null          | User candidate socket id |
| to       | String   | Yes     | Null          | User (candidate) who will receive message (same as peer_id) |

Example
```JavaScript
socket.emit('room-join-accept', {
    auth: sessionToken,
    room: 'test-room',
    peer_id: '123',
    to: '123',
})
```

---

### - room-join-reject
> Dispatched when room owner reject user (candidate) join request

Parameters:

| Name     | Type     | Require | Default value | description              |
| -------- | -------- | ------- | ------------- | ------------------------ |
| auth     | String   | Yes     | Null          | User Auth token          |
| room     | String   | Yes     | Null          | Room name to join        |
| peer_id  | String   | Yes     | Null          | User candidate socket id |
| to       | String   | Yes     | Null          | User (candidate) who will receive message (same as peer_id) |

Example
```JavaScript
socket.emit('room-join-reject', {
    auth: sessionToken,
    room: 'test-room',
    peer_id: '123',
    to: '123',
})
```

---

### - relay-session-description
> Dispatched when local user try to connect with remote user

Parameters:

| Name                | Type     | Require | Default value | description              |
| ------------------- | -------- | ------- | ------------- | ------------------------ |
| auth                | String   | Yes     | Null          | User Auth token          |
| room                | String   | Yes     | Null          | Room name to join        |
| peer_id             | String   | Yes     | Null          | User candidate socket id |
| to                  | String   | Yes     | Null          | User (candidate) who will receive message (same as peer_id) |
| session_description | String   | Yes     | Null          | Local Session Description object offer |

Example
```JavaScript
const peer_id   = '321'; // Remote user Socket ID
const iceConfig = { ... } // Your ice servers config
const peer  = new RTCPeerConnection(iceConfig, {"optional": [{"DtlsSrtpKeyAgreement": true}]})
const offer = await peer.createOffer()
await peer.setLocalDescription(offer)

socket.emit('relay-session-description', {
    auth: sessionToken,
    to: peer_id,
    peer_id: peer_id,
    session_description: offer,
    room: 'test-room',
})
```

---

### - relay-ice-candidate
> Dispatched when local user accepted his ICE info, then user should send ICE info to another users in room.

Parameters:

| Name                | Type     | Require | Default value | description              |
| ------------------- | -------- | ------- | ------------- | ------------------------ |
| auth                | String   | Yes     | Null          | User Auth token          |
| room                | String   | Yes     | Null          | Room name to join        |
| peer_id             | String   | Yes     | Null          | User candidate socket id |
| to                  | String   | Yes     | Null          | User (candidate) who will receive message (same as peer_id) |
| session_description | String   | Yes     | Null          | Local Session Description object offer |

Example
```JavaScript
const peer_id   = '321'; // Remote user Socket ID
const iceConfig = { ... } // Your ice servers config
const peer  = new RTCPeerConnection(iceConfig, {"optional": [{"DtlsSrtpKeyAgreement": true}]})
const offer = await peer.createOffer()
await peer.setLocalDescription(offer)

peer.onicecandidate = event => {
    socket.emitSocket('relay-ice-candidate', {
        to: peer_id,
        peer_id: peer_id, 
        room: 'test-room',
        ice_candidate: {
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            candidate:     event.candidate.candidate
        }
    })
}
```


### Events (ws messages emits from server)

### - unauthorized
> Dispatched when local user token is not passed or expired

Parameters:

| Name    | Type   | description   | Example            |
| ------- | ------ | ------------- | ------------------ |
| message | String | Error message | Token is not valid |

Example

```JavaScript
socket.on('unauthorized', data => console.log(data))
/* output:
{
    message: 'Token is not valid'
}
*/
```

---

### - auth-accept
> Dispatched when local user successfully authorized (this is an answer on `auth-request` event)

Parameters:

| Name  | Type   | description   | Example            |
| ----- | ------ | ------------- | ------------------ |
| token | String | Error message | Token is not valid |

Example

```JavaScript
socket.on('unauthorized', data => console.log(data))
/* output:
{
    token: 'T123123qweqweqw.1213rr2qr23r2.23423234r23'
}
*/
```

---

### - auth-reject
> Dispatched when local user was failed authorization (this is an answer on `auth-request` event)

Parameters:

| Name    | Type   | description   | Example            |
| ------- | ------ | ------------- | ------------------ |
| message | String | Error message | Token is not valid |

Example

```JavaScript
socket.on('auth-reject', data => console.log(data))
/* output:
{
    message: 'Token is not valid'
}
*/
```

---

### - room-create-accept
> Dispatched when local user was successfully created new room (this is an answer on `room-create-request` event)

Parameters:

| Name | Type   | description | Example   |
| ---- | ------ | ----------- | --------- |
| room | String | Room name   | test-room |

Example

```JavaScript
socket.on('room-create-accept', data => console.log(data))
/* output:
{
    room: 'test-room'
}
*/
```

---

### - room-create-reject
> Dispatched when local user was successfully created new room (this is an answer on `room-create-request` event)

Parameters:

| Name    | Type   | description   | Example                         |
| ------- | ------ | ------------- | ------------------------------- |
| message | String | Error message | Room already taken someone else |

Example

```JavaScript
socket.on('room-create-reject', data => console.log(data))
/* output:
{
    message: 'Room already taken someone else. Please type another room name or stay it blank'
}
*/
```

---

### - room-join-request
> Dispatched only on room owner when remote user wants to join room and he sent `room-join-request` event

Parameters:

| Name    | Type   | description           | Example      |
| ------- | ------ | --------------------- | ------------ |
| room    | String | Room name             | Test room    |
| peer_id | String | Remote user socket id | 123321123321 |

Example

```JavaScript
socket.on('room-join-request', data => console.log(data))
/* output:
{
    room: 'test-room'
    peer_id: '123321123321'
}
*/
```

---

### - room-join-accept
> Dispatched when room owner was accept local user `room-join-request` (this is an answer on `room-join-request` event)

Parameters:

| Name    | Type          | description                                 | Example                            |
| ------- | ------------- | ------------------------------------------- | ---------------------------------- |
| room    | String        | Room name                                   | Test room                          |
| peer_id | String        | Local user socket id                        | 123321123321                       |
| peers   | Array<String> | List of all remote users socket ids in room | ['1231231231231', '3453453453453'] |

Example

```JavaScript
socket.on('room-join-accept', data => console.log(data))
/* output:
{
    room: 'test-room'
    peer_id: '123321123321'
    peers: [
        '1231231231231',
        '3453453453453',
        '5643567456756'
    ]
}
*/
```

---

### - room-join-reject
> Dispatched when room owner was reject `room-join-request` (this is an answer on `room-join-request` event)

Parameters:

| Name    | Type   | description   | Example                            |
| ------- | ------ | ------------- | ---------------------------------- |
| message | String | Error message | Room ower was reqject your request |

Example

```JavaScript
socket.on('room-join-reject', data => console.log(data))
/* output:
{
    message: 'Room ower was reqject your request'
}
*/
```

---

### - room-user-join
> Dispatched when remote user join in the room (this is an answer on `room-join-request` event for all users in room)

Parameters:

| Name    | Type   | description           | Example      |
| ------- | ------ | --------------------- | ------------ |
| room    | String | Room name             | Test room    |
| peer_id | String | Remote user socket id | 123321123321 |

Example

```JavaScript
socket.on('room-user-join', data => console.log(data))
/* output:
{
    room: 'test-room'
    peer_id: '123321123321'
}
*/
```

---

### - ice-candidate (WebRTC Handshake)
> Dispatched when remote user sent his ice candidate

Parameters:

| Name          | Type   | description               | Example                             |
| ------------- | ------ | ------------------------- | ----------------------------------- |
| room          | String | Room name                 | Test room                           |
| peer_id       | String | Remote user socket id     | 123321123321                        |
| ice_candidate | Object | Remote user ice candidate | { candidate: '', sdpMLineIndex: 0 } |

Example

```JavaScript
socket.on('ice-candidate', data => console.log(data))
/* output:
{
    room: 'test-room'
    peer_id: '123321123321',
    ice_candidate: {
        candidate: 'candidate:4248172766 1 udp 2122260223 162.14.76.3 62375 typ host generation 0 ufrag IEYX network-id 1'
        sdpMLineIndex: 0
    } 
*/
```

---

### - session-description (WebRTC Handshake)
> Dispatched when remote user sent his session description

Parameters:

| Name                | Type   | description                     | Example              |
| ------------------- | ------ | ------------------------------- | -------------------- |
| room                | String | Room name                       | Test room            |
| peer_id             | String | Remote user socket id           | 123321123321         |
| session_description | Object | Remote user session description | { sdp: '', type: 0 } |

Example

```JavaScript
socket.on('session-description', data => console.log(data))
/* output:
{
    room: 'test-room'
    peer_id: '123321123321',
    session_description: {
        sdp: 'v=0\r\no=-...'
        type: 'offer'
    } 
*/
```