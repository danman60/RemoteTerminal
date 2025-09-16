/**
 * Service Manager for starting, stopping, and managing test services
 */

const { spawn, exec } = require('child_process');
const axios = require('axios');
const path = require('path');
const TestUtils = require('./test-utils');

class ServiceManager extends TestUtils {
  constructor(config) {
    super(config);
    this.services = {
      host: null,
      proxy: null
    };
  }

  /**
   * Start the Windows Host Service
   */
  async startHostService() {
    this.log('starting', 'Starting Windows Host Service');

    return new Promise((resolve, reject) => {
      const servicePath = this.config.paths.hostService;
      const args = ['--port', this.config.services.host.port.toString()];

      this.services.host = spawn(servicePath, args, {
        stdio: 'pipe',
        detached: false
      });

      this.services.host.stdout.on('data', (data) => {
        this.log('info', `Host Service: ${data.toString().trim()}`);
      });

      this.services.host.stderr.on('data', (data) => {
        this.log('warn', `Host Service Error: ${data.toString().trim()}`);
      });

      this.services.host.on('error', (error) => {
        this.log('failed', `Failed to start Host Service: ${error.message}`);
        reject(error);
      });

      this.services.host.on('exit', (code) => {
        this.log('info', `Host Service exited with code ${code}`);
      });

      // Wait for service to be ready
      this.waitForServiceReady('host')
        .then(() => {
          this.log('running', 'Host Service is running');
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Start the WebSocket Proxy Service
   */
  async startProxyService() {
    this.log('starting', 'Starting WebSocket Proxy Service');

    return new Promise((resolve, reject) => {
      const servicePath = this.config.paths.proxyService;
      const args = [
        '--port', this.config.services.proxy.port.toString(),
        '--host-port', this.config.services.host.port.toString()
      ];

      this.services.proxy = spawn('node', [servicePath, ...args], {
        stdio: 'pipe',
        detached: false
      });

      this.services.proxy.stdout.on('data', (data) => {
        this.log('info', `Proxy Service: ${data.toString().trim()}`);
      });

      this.services.proxy.stderr.on('data', (data) => {
        this.log('warn', `Proxy Service Error: ${data.toString().trim()}`);
      });

      this.services.proxy.on('error', (error) => {
        this.log('failed', `Failed to start Proxy Service: ${error.message}`);
        reject(error);
      });

      this.services.proxy.on('exit', (code) => {
        this.log('info', `Proxy Service exited with code ${code}`);
      });

      // Wait for service to be ready
      this.waitForServiceReady('proxy')
        .then(() => {
          this.log('running', 'Proxy Service is running');
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Wait for a service to be ready by checking its health endpoint
   */
  async waitForServiceReady(serviceName, timeout = 30000) {
    const startTime = Date.now();
    const service = this.config.services[serviceName];

    const checkHealth = async () => {
      try {
        let url;
        if (serviceName === 'host') {
          url = `${service.protocol}://${service.host}:${service.port}${service.healthEndpoint}`;
          const response = await axios.get(url, { timeout: 5000 });
          return response.status === 200;
        } else if (serviceName === 'proxy') {
          // For WebSocket proxy, try to establish a connection
          const WebSocket = require('ws');
          return new Promise((resolve) => {
            const ws = new WebSocket(`${service.protocol}://${service.host}:${service.port}${service.wsEndpoint}`);
            ws.on('open', () => {
              ws.close();
              resolve(true);
            });
            ws.on('error', () => resolve(false));
            setTimeout(() => resolve(false), 5000);
          });
        }
      } catch (error) {
        return false;
      }
    };

    return this.waitFor(checkHealth, timeout, 1000);
  }

  /**
   * Stop a specific service
   */
  async stopService(serviceName) {
    this.log('stopping', `Stopping ${serviceName} service`);

    const service = this.services[serviceName];
    if (!service) {
      this.log('warn', `Service ${serviceName} not running`);
      return;
    }

    return new Promise((resolve) => {
      service.on('exit', () => {
        this.log('info', `${serviceName} service stopped`);
        this.services[serviceName] = null;
        resolve();
      });

      // Try graceful shutdown first
      service.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (service && !service.killed) {
          this.log('warn', `Force killing ${serviceName} service`);
          service.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Stop all services
   */
  async stopAllServices() {
    this.log('cleanup', 'Stopping all services');

    const promises = Object.keys(this.services)
      .filter(name => this.services[name])
      .map(name => this.stopService(name));

    await Promise.all(promises);
  }

  /**
   * Check if a service is running
   */
  isServiceRunning(serviceName) {
    return this.services[serviceName] && !this.services[serviceName].killed;
  }

  /**
   * Get service health status
   */
  async getServiceHealth(serviceName) {
    if (!this.isServiceRunning(serviceName)) {
      return { status: 'stopped', healthy: false };
    }

    try {
      const service = this.config.services[serviceName];

      if (serviceName === 'host') {
        const url = `${service.protocol}://${service.host}:${service.port}${service.healthEndpoint}`;
        const response = await axios.get(url, { timeout: 5000 });
        return {
          status: 'running',
          healthy: response.status === 200,
          response: response.data
        };
      } else if (serviceName === 'proxy') {
        // Simple connection test for WebSocket proxy
        const WebSocket = require('ws');
        return new Promise((resolve) => {
          const ws = new WebSocket(`${service.protocol}://${service.host}:${service.port}${service.wsEndpoint}`);
          ws.on('open', () => {
            ws.close();
            resolve({ status: 'running', healthy: true });
          });
          ws.on('error', () => {
            resolve({ status: 'running', healthy: false });
          });
          setTimeout(() => {
            resolve({ status: 'running', healthy: false });
          }, 5000);
        });
      }
    } catch (error) {
      return {
        status: 'running',
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Restart a service
   */
  async restartService(serviceName) {
    this.log('info', `Restarting ${serviceName} service`);

    await this.stopService(serviceName);
    await this.sleep(2000); // Wait a bit before restart

    if (serviceName === 'host') {
      await this.startHostService();
    } else if (serviceName === 'proxy') {
      await this.startProxyService();
    }
  }

  /**
   * Kill any existing services on the configured ports (cleanup)
   */
  async killExistingServices() {
    this.log('cleanup', 'Killing existing services on configured ports');

    const ports = [
      this.config.services.host.port,
      this.config.services.proxy.port
    ];

    for (const port of ports) {
      try {
        await this.killProcessOnPort(port);
      } catch (error) {
        this.log('warn', `Failed to kill process on port ${port}: ${error.message}`);
      }
    }
  }

  /**
   * Kill process running on specific port (Windows)
   */
  async killProcessOnPort(port) {
    return new Promise((resolve, reject) => {
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(); // No process found
          return;
        }

        const lines = stdout.split('\n');
        const pids = lines
          .map(line => line.trim().split(/\s+/))
          .filter(parts => parts.length >= 5 && parts[1].includes(`:${port}`))
          .map(parts => parts[4])
          .filter(pid => pid && pid !== '0');

        if (pids.length === 0) {
          resolve();
          return;
        }

        const uniquePids = [...new Set(pids)];
        this.log('info', `Killing processes: ${uniquePids.join(', ')}`);

        let killed = 0;
        uniquePids.forEach(pid => {
          exec(`taskkill /F /PID ${pid}`, (killError) => {
            killed++;
            if (killed === uniquePids.length) {
              resolve();
            }
          });
        });
      });
    });
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    await this.stopAllServices();
    await super.cleanup();
  }
}

module.exports = ServiceManager;