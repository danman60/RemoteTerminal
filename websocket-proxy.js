const http = require('http');
const WebSocket = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = 8082;
const TARGET_HOST = 'localhost';
const TARGET_PORT = 8080;

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

    targetWs.on('open', () => {
        console.log('Connected to target server');

        // Forward messages from client to target
        clientWs.on('message', (message) => {
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(message);
            }
        });

        // Forward messages from target to client
        targetWs.on('message', (message) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(message);
            }
        });
    });

    targetWs.on('error', (error) => {
        console.error('Target WebSocket error:', error.message);
        clientWs.close(1011, 'Target server error');
    });

    targetWs.on('close', () => {
        console.log('Target WebSocket closed');
        clientWs.close(1000, 'Target server closed');
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error.message);
        targetWs.close();
    });

    clientWs.on('close', () => {
        console.log('Client WebSocket closed');
        targetWs.close();
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