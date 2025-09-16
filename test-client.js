#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');

class TerminalTestClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.deviceKey = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
        this.messageId = 0;
        this.testResults = [];

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data,
            messageId: ++this.messageId
        };

        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
        if (data) {
            console.log('  Data:', JSON.stringify(data, null, 2));
        }

        this.testResults.push(logEntry);
    }

    async connect(url = 'ws://localhost:8080') {
        return new Promise((resolve, reject) => {
            this.log('info', `🔌 Attempting to connect to ${url}`);

            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                this.connected = true;
                this.log('success', '✅ WebSocket connection established');
                this.authenticate();
                resolve();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                this.connected = false;
                this.authenticated = false;
                this.log('warning', `🔒 Connection closed`, { code, reason: reason.toString() });
            });

            this.ws.on('error', (error) => {
                this.log('error', `❌ WebSocket error: ${error.message}`, error);
                reject(error);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    authenticate() {
        const authMessage = {
            type: "auth",
            device_key: this.deviceKey,
            host_id: "",
            client_version: "1.0.0-test",
            timestamp: Date.now()
        };

        this.log('info', '🔐 Sending authentication message', authMessage);
        this.send(authMessage);
    }

    send(message) {
        if (!this.connected) {
            this.log('error', '❌ Cannot send message - not connected');
            return false;
        }

        try {
            const messageJson = JSON.stringify(message);
            this.ws.send(messageJson);
            this.log('debug', '📤 Sent message', { type: message.type, size: messageJson.length });
            return true;
        } catch (error) {
            this.log('error', `❌ Error sending message: ${error.message}`, error);
            return false;
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            this.log('debug', '📥 Received message', message);

            switch (message.type) {
                case 'auth_ok':
                    this.authenticated = true;
                    this.log('success', '✅ Authentication successful', {
                        shell: message.shell,
                        pty: message.pty
                    });
                    this.startInteractiveMode();
                    break;

                case 'stdout_chunk':
                    this.handleTerminalOutput(message);
                    break;

                case 'error':
                    this.log('error', `❌ Server error: ${message.message}`, {
                        code: message.code,
                        message: message.message
                    });
                    break;

                case 'pong':
                    this.log('debug', '🏓 Received pong');
                    break;

                default:
                    this.log('warning', `⚠️ Unknown message type: ${message.type}`, message);
            }
        } catch (error) {
            this.log('error', `❌ Error parsing message: ${error.message}`, {
                raw: data.toString()
            });
        }
    }

    handleTerminalOutput(message) {
        try {
            const decoded = Buffer.from(message.data, 'base64').toString('utf8');
            this.log('terminal', '📺 Terminal output', {
                raw: decoded,
                length: decoded.length
            });

            // Display terminal output in a distinguishable way
            console.log('\n' + '='.repeat(50));
            console.log('TERMINAL OUTPUT:');
            console.log(decoded);
            console.log('='.repeat(50) + '\n');
        } catch (error) {
            this.log('error', `❌ Error decoding terminal output: ${error.message}`);
        }
    }

    sendCommand(command) {
        if (!this.authenticated) {
            this.log('error', '❌ Cannot send command - not authenticated');
            return false;
        }

        const message = {
            type: "stdin_input",
            mode: "text",
            data: command + "\r\n",
            timestamp: Date.now()
        };

        this.log('info', `⌨️ Sending command: "${command}"`, message);
        return this.send(message);
    }

    sendPing() {
        const message = {
            type: "ping",
            timestamp: Date.now()
        };

        this.log('debug', '🏓 Sending ping');
        return this.send(message);
    }

    resize(cols, rows) {
        const message = {
            type: "resize",
            cols: cols,
            rows: rows,
            timestamp: Date.now()
        };

        this.log('info', `📐 Resizing terminal to ${cols}x${rows}`, message);
        return this.send(message);
    }

    sendSignal(signal) {
        const message = {
            type: "signal",
            name: signal,
            timestamp: Date.now()
        };

        this.log('info', `⚡ Sending signal: ${signal}`, message);
        return this.send(message);
    }

    startInteractiveMode() {
        console.log('\n' + '='.repeat(60));
        console.log('🎮 INTERACTIVE MODE - Available commands:');
        console.log('  Type any command to execute in terminal');
        console.log('  /ping - Send ping message');
        console.log('  /resize <cols> <rows> - Resize terminal');
        console.log('  /signal <name> - Send signal (INT, BREAK)');
        console.log('  /test - Run automated tests');
        console.log('  /quit - Exit');
        console.log('='.repeat(60) + '\n');

        this.promptForInput();
    }

    promptForInput() {
        this.rl.question('RTX> ', (input) => {
            if (!input.trim()) {
                this.promptForInput();
                return;
            }

            const cmd = input.trim();

            if (cmd === '/quit') {
                this.disconnect();
                return;
            }

            if (cmd === '/ping') {
                this.sendPing();
            } else if (cmd.startsWith('/resize ')) {
                const parts = cmd.split(' ');
                if (parts.length === 3) {
                    this.resize(parseInt(parts[1]), parseInt(parts[2]));
                } else {
                    console.log('Usage: /resize <cols> <rows>');
                }
            } else if (cmd.startsWith('/signal ')) {
                const signal = cmd.substring(8);
                this.sendSignal(signal);
            } else if (cmd === '/test') {
                this.runAutomatedTests();
            } else {
                // Regular command
                this.sendCommand(cmd);
            }

            // Continue prompting
            setTimeout(() => this.promptForInput(), 100);
        });
    }

    async runAutomatedTests() {
        this.log('info', '🧪 Starting automated test suite');

        const tests = [
            () => this.testPing(),
            () => this.testResize(),
            () => this.testBasicCommands(),
            () => this.testSignals(),
        ];

        for (let i = 0; i < tests.length; i++) {
            this.log('info', `🧪 Running test ${i + 1}/${tests.length}`);
            await tests[i]();
            await this.sleep(1000); // Wait 1 second between tests
        }

        this.log('success', '✅ Automated test suite completed');
    }

    async testPing() {
        this.log('info', '🧪 Testing ping/pong');
        this.sendPing();
        return this.sleep(500);
    }

    async testResize() {
        this.log('info', '🧪 Testing terminal resize');
        this.resize(80, 24);
        await this.sleep(500);
        this.resize(120, 30);
        return this.sleep(500);
    }

    async testBasicCommands() {
        this.log('info', '🧪 Testing basic commands');
        this.sendCommand('echo "Test command 1"');
        await this.sleep(1000);
        this.sendCommand('dir');
        await this.sleep(1000);
        this.sendCommand('echo "Test completed"');
        return this.sleep(1000);
    }

    async testSignals() {
        this.log('info', '🧪 Testing signal handling');
        // Start a long-running command
        this.sendCommand('ping -t 127.0.0.1');
        await this.sleep(2000);
        // Send interrupt signal
        this.sendSignal('INT');
        return this.sleep(1000);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    disconnect() {
        if (this.ws) {
            this.log('info', '👋 Disconnecting...');
            this.ws.close();
        }
        this.rl.close();
        process.exit(0);
    }

    generateReport() {
        const summary = {
            totalMessages: this.testResults.length,
            errors: this.testResults.filter(r => r.level === 'error').length,
            warnings: this.testResults.filter(r => r.level === 'warning').length,
            successes: this.testResults.filter(r => r.level === 'success').length,
            startTime: this.testResults[0]?.timestamp,
            endTime: this.testResults[this.testResults.length - 1]?.timestamp
        };

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST REPORT');
        console.log('='.repeat(60));
        console.log(`Total Messages: ${summary.totalMessages}`);
        console.log(`Errors: ${summary.errors}`);
        console.log(`Warnings: ${summary.warnings}`);
        console.log(`Successes: ${summary.successes}`);
        console.log(`Duration: ${summary.startTime} - ${summary.endTime}`);
        console.log('='.repeat(60));

        return summary;
    }
}

// Main execution
async function main() {
    const client = new TerminalTestClient();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, generating report...');
        client.generateReport();
        client.disconnect();
    });

    try {
        const url = process.argv[2] || 'ws://localhost:8080';
        await client.connect(url);
    } catch (error) {
        console.error('❌ Failed to connect:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TerminalTestClient;