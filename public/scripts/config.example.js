window.env = {
    iceConfig: {
        iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302'
            },
            {
                urls: 'turn:your-turn-server-domain.com',
                username: 'your-turn-server-user-name',
                credential: 'your-turn-server-password',
            },
        ]
    }
}