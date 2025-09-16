/**
 * WebSocket Test Client for Remote Terminal Sync Testing
 */

const WebSocket = require('ws');
const TestUtils = require('./test-utils');

class WebSocketTestClient extends TestUtils {
  constructor(config) {
    super(config);
    this.ws = null;
    this.connectionState = 'disconnected';
    this.messageHandlers = new Map();
    this.lastMessageReceived = null;
    this.messageHistory = [];
  }

  /**
   * Connect to WebSocket proxy
   */
  async connect(deviceKey = null) {
    const service = this.config.services.proxy;
    const url = `${service.protocol}://${service.host}:${service.port}${service.wsEndpoint}`;

    this.log('connecting', `Connecting to WebSocket: ${url}`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.connectionState = 'connected';
          this.log('connected', 'WebSocket connection established');

          // Send authentication if device key provided
          if (deviceKey) {
            this.authenticate(deviceKey)
              .then(resolve)
              .catch(reject);
          } else {
            resolve();
          }
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.connectionState = 'disconnected';
          this.log('disconnected', `WebSocket closed: ${code} - ${reason}`);
        });

        this.ws.on('error', (error) => {
          this.connectionState = 'error';
          this.log('failed', `WebSocket error: ${error.message}`);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (this.connectionState !== 'connected') {
            this.log('timeout', 'WebSocket connection timeout');
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.log('failed', `Failed to create WebSocket: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Authenticate with device key
   */
  async authenticate(deviceKey) {
    this.log('info', 'Authenticating with device key');

    const authMessage = {
      type: 'auth',
      deviceKey: deviceKey,
      timestamp: Date.now()
    };

    await this.sendMessage(authMessage);

    // Wait for auth response
    return this.waitForMessage('auth_response', 5000);
  }

  /**
   * Send a message through WebSocket
   */
  async sendMessage(message) {
    if (this.connectionState !== 'connected') {
      throw new Error('WebSocket not connected');
    }

    const messageStr = JSON.stringify(message);
    this.log('sending', `Sending message: ${message.type}`, message);

    return new Promise((resolve, reject) => {
      this.ws.send(messageStr, (error) => {
        if (error) {
          this.log('failed', `Failed to send message: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      this.lastMessageReceived = message;
      this.messageHistory.push({
        timestamp: Date.now(),
        message: message
      });

      this.log('receiving', `Received message: ${message.type}`, message);

      // Call registered handlers
      const handlers = this.messageHandlers.get(message.type) || [];
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          this.log('warn', `Message handler error: ${error.message}`);
        }
      });

    } catch (error) {
      this.log('warn', `Failed to parse message: ${error.message}`);
    }
  }

  /**
   * Register a message handler
   */
  onMessage(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType).push(handler);
  }

  /**
   * Wait for a specific message type
   */
  async waitForMessage(messageType, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type: ${messageType}`));
      }, timeout);

      const handler = (message) => {
        clearTimeout(timeoutId);
        resolve(message);
      };

      this.onMessage(messageType, handler);
    });
  }

  /**
   * Send terminal discovery request
   */
  async discoverTerminals() {
    this.log('info', 'Requesting terminal discovery');

    const discoveryMessage = {
      type: 'discover_terminals',
      timestamp: Date.now()
    };

    await this.sendMessage(discoveryMessage);
    return this.waitForMessage('terminals_discovered', 10000);
  }

  /**
   * Attach to a terminal
   */
  async attachToTerminal(terminalId) {
    this.log('info', `Attaching to terminal: ${terminalId}`);

    const attachMessage = {
      type: 'attach_terminal',
      terminalId: terminalId,
      timestamp: Date.now()
    };

    await this.sendMessage(attachMessage);
    return this.waitForMessage('terminal_attached', 10000);
  }

  /**
   * Send command to terminal
   */
  async sendCommand(command) {
    this.log('info', `Sending command: ${command}`);

    const commandMessage = {
      type: 'terminal_input',
      command: command,
      timestamp: Date.now()
    };

    await this.sendMessage(commandMessage);
  }

  /**
   * Wait for terminal output
   */
  async waitForOutput(expectedText = null, timeout = 5000) {
    if (expectedText) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Timeout waiting for output: ${expectedText}`));
        }, timeout);

        const handler = (message) => {
          if (message.type === 'terminal_output' &&
              message.output &&
              message.output.includes(expectedText)) {
            clearTimeout(timeoutId);
            resolve(message);
          }
        };

        this.onMessage('terminal_output', handler);
      });
    } else {
      return this.waitForMessage('terminal_output', timeout);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect() {
    if (this.ws && this.connectionState === 'connected') {
      this.log('info', 'Disconnecting WebSocket');

      return new Promise((resolve) => {
        this.ws.on('close', () => {
          this.connectionState = 'disconnected';
          resolve();
        });

        this.ws.close();

        // Force close after timeout
        setTimeout(() => {
          if (this.connectionState !== 'disconnected') {
            this.ws.terminate();
            this.connectionState = 'disconnected';
            resolve();
          }
        }, 5000);
      });
    }
  }

  /**
   * Test connection latency
   */
  async testLatency(samples = 5) {
    const latencies = [];

    for (let i = 0; i < samples; i++) {
      const startTime = Date.now();

      const pingMessage = {
        type: 'ping',
        timestamp: startTime
      };

      await this.sendMessage(pingMessage);
      const pongMessage = await this.waitForMessage('pong', 5000);

      const latency = Date.now() - startTime;
      latencies.push(latency);

      this.log('info', `Ping ${i + 1}: ${latency}ms`);

      if (i < samples - 1) {
        await this.sleep(1000); // Wait between pings
      }
    }

    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    return {
      average: avgLatency,
      minimum: minLatency,
      maximum: maxLatency,
      samples: latencies
    };
  }

  /**
   * Simulate network issues
   */
  async simulateNetworkIssue(issueType) {
    switch (issueType) {
      case 'sudden_disconnect':
        this.log('info', 'Simulating sudden disconnect');
        this.ws.terminate();
        break;

      case 'graceful_disconnect':
        this.log('info', 'Simulating graceful disconnect');
        this.ws.close();
        break;

      case 'network_timeout':
        this.log('info', 'Simulating network timeout');
        // Send message and immediately disconnect
        await this.sendMessage({ type: 'test', data: 'timeout test' });
        this.ws.terminate();
        break;

      default:
        throw new Error(`Unknown network issue type: ${issueType}`);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      state: this.connectionState,
      messagesReceived: this.messageHistory.length,
      lastMessage: this.lastMessageReceived,
      uptime: this.connectionState === 'connected' ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    await this.disconnect();
    this.messageHandlers.clear();
    this.messageHistory = [];
    await super.cleanup();
  }
}

module.exports = WebSocketTestClient;