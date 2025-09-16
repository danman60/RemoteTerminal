const http = require('http');
const WebSocket = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = 8080;
const TARGET_HOST = 'localhost';
const TARGET_PORT = 8081;

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

console.log(`Starting WebSocket proxy on port ${PORT}`);
console.log(`Forwarding to ${TARGET_HOST}:${TARGET_PORT}`);

wss.on('connection', (clientWs, request) => {
    console.log(`New client connection from ${request.socket.remoteAddress}`);

    // Create connection to target server
    const targetWs = new WebSocket(`ws://${TARGET_HOST}:${TARGET_PORT}`);
    let isConnected = false;
    let messageQueue = [];

    // Forward messages from client to target
    clientWs.on('message', (message) => {
        try {
            console.log('Client message:', message.toString().substring(0, 100));
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(message);
            } else if (targetWs.readyState === WebSocket.CONNECTING) {
                console.log('Target not ready, queuing message');
                messageQueue.push(message);

                // Prevent queue from growing too large
                if (messageQueue.length > 100) {
                    console.warn('Message queue too large, dropping oldest message');
                    messageQueue.shift();
                }
            } else {
                console.warn('Target connection failed, dropping message:', {
                    targetState: targetWs.readyState,
                    messagePreview: message.toString().substring(0, 50)
                });
            }
        } catch (error) {
            console.error('Error forwarding client message:', error);
        }
    });

    targetWs.on('open', () => {
        console.log('Connected to target server');
        isConnected = true;

        // Send any queued messages
        console.log(`Sending ${messageQueue.length} queued messages`);
        messageQueue.forEach((message, index) => {
            try {
                console.log(`Sending queued message ${index + 1}:`, message.toString().substring(0, 100));
                targetWs.send(message);
            } catch (error) {
                console.error(`Error sending queued message ${index + 1}:`, error);
            }
        });
        messageQueue = [];

        // Forward messages from target to client
        targetWs.on('message', (message) => {
            console.log('Target message:', message.toString().substring(0, 100));
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(message);
            }
        });
    });

    targetWs.on('error', (error) => {
        console.error('Target WebSocket error:', error.message);
        console.error('Error details:', {
            code: error.code,
            type: error.name,
            message: error.message,
            targetState: targetWs.readyState,
            clientState: clientWs.readyState
        });

        // Clean up message queue on target error
        if (messageQueue.length > 0) {
            console.warn(`Discarding ${messageQueue.length} queued messages due to target error`);
            messageQueue = [];
        }

        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'Target server error');
        }
    });

    targetWs.on('close', (code, reason) => {
        console.log('Target WebSocket closed:', code, reason.toString());
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1000, 'Target server closed');
        }
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
        if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.close();
        }
    });

    clientWs.on('close', (code, reason) => {
        console.log('Client WebSocket closed:', code, reason.toString());
        if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.close();
        }
    });
});

// Bind to all interfaces (0.0.0.0) so it can accept external connections
server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebSocket proxy listening on all interfaces port ${PORT}`);
    console.log(`Forwarding WebSocket connections to ${TARGET_HOST}:${TARGET_PORT}`);
});

server.on('error', (error) => {
    console.error('Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please stop other services on this port.`);
    }
});