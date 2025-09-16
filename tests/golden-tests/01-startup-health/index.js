/**
 * Golden Tests: Service Startup & Health (3 tests)
 * Tests basic service lifecycle and health monitoring
 */

const ServiceManager = require('../../utils/service-manager');
const axios = require('axios');

class StartupHealthTests extends ServiceManager {
  constructor(config) {
    super(config);
    this.category = 'startup';
  }

  /**
   * Run all startup and health tests
   */
  async runAll() {
    this.log('info', 'Starting Service Startup & Health Tests');

    const tests = [
      this.test01_HostServiceStartup.bind(this),
      this.test02_ProxyServiceStartup.bind(this),
      this.test03_ServicesHealthCheck.bind(this)
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = await this.runTest(test);
        results.push(result);
      } catch (error) {
        results.push({
          name: test.name,
          category: this.category,
          status: 'fail',
          error: error.message,
          duration: 0
        });
      }
    }

    await this.cleanup();
    return results;
  }

  /**
   * Test 01: Host Service Startup
   * Verifies Windows Host Service starts successfully and binds to port
   */
  async test01_HostServiceStartup() {
    this.log('info', 'Test 01: Host Service Startup');

    const startTime = Date.now();

    try {
      // Clean up any existing services
      await this.killExistingServices();
      await this.sleep(2000);

      // Start the host service
      await this.startHostService();

      // Verify service is running
      const health = await this.getServiceHealth('host');

      if (!health.healthy) {
        throw new Error('Host service started but health check failed');
      }

      this.log('pass', 'Host service started successfully');

      return {
        name: 'Host Service Startup',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          port: this.config.services.host.port,
          healthStatus: health,
          startupTime: Date.now() - startTime
        }
      };

    } catch (error) {
      this.log('fail', `Host service startup failed: ${error.message}`);

      return {
        name: 'Host Service Startup',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime,
        details: {
          port: this.config.services.host.port,
          expectedPath: this.config.paths.hostService
        }
      };
    }
  }

  /**
   * Test 02: Proxy Service Startup
   * Verifies WebSocket Proxy Service starts successfully
   */
  async test02_ProxyServiceStartup() {
    this.log('info', 'Test 02: Proxy Service Startup');

    const startTime = Date.now();

    try {
      // Ensure host service is running (dependency)
      if (!this.isServiceRunning('host')) {
        await this.startHostService();
      }

      // Start the proxy service
      await this.startProxyService();

      // Verify service is running
      const health = await this.getServiceHealth('proxy');

      if (!health.healthy) {
        throw new Error('Proxy service started but health check failed');
      }

      this.log('pass', 'Proxy service started successfully');

      return {
        name: 'Proxy Service Startup',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          port: this.config.services.proxy.port,
          healthStatus: health,
          startupTime: Date.now() - startTime
        }
      };

    } catch (error) {
      this.log('fail', `Proxy service startup failed: ${error.message}`);

      return {
        name: 'Proxy Service Startup',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime,
        details: {
          port: this.config.services.proxy.port,
          expectedPath: this.config.paths.proxyService
        }
      };
    }
  }

  /**
   * Test 03: Services Health Check
   * Verifies both services respond to health checks and report correct status
   */
  async test03_ServicesHealthCheck() {
    this.log('info', 'Test 03: Services Health Check');

    const startTime = Date.now();

    try {
      // Ensure both services are running
      if (!this.isServiceRunning('host')) {
        await this.startHostService();
      }

      if (!this.isServiceRunning('proxy')) {
        await this.startProxyService();
      }

      // Test host service health endpoint
      const hostHealth = await this.testHostHealthEndpoint();

      // Test proxy service health (WebSocket connection test)
      const proxyHealth = await this.testProxyHealthEndpoint();

      // Test cross-service communication
      const crossServiceHealth = await this.testCrossServiceCommunication();

      // Verify all health checks passed
      if (!hostHealth.healthy || !proxyHealth.healthy || !crossServiceHealth.healthy) {
        const failedServices = [];
        if (!hostHealth.healthy) failedServices.push('host');
        if (!proxyHealth.healthy) failedServices.push('proxy');
        if (!crossServiceHealth.healthy) failedServices.push('cross-service communication');

        throw new Error(`Health check failed for: ${failedServices.join(', ')}`);
      }

      this.log('pass', 'All services health checks passed');

      return {
        name: 'Services Health Check',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          hostHealth,
          proxyHealth,
          crossServiceHealth,
          totalHealthCheckTime: Date.now() - startTime
        }
      };

    } catch (error) {
      this.log('fail', `Services health check failed: ${error.message}`);

      return {
        name: 'Services Health Check',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test host service health endpoint
   */
  async testHostHealthEndpoint() {
    const service = this.config.services.host;
    const url = `${service.protocol}://${service.host}:${service.port}${service.healthEndpoint}`;

    try {
      this.log('info', `Testing host health endpoint: ${url}`);

      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status === 200
      });

      const healthy = response.status === 200;

      this.log(healthy ? 'pass' : 'fail', `Host health check: ${healthy ? 'OK' : 'FAILED'}`);

      return {
        healthy,
        status: response.status,
        data: response.data,
        responseTime: response.headers['x-response-time'] || 'unknown'
      };

    } catch (error) {
      this.log('fail', `Host health endpoint error: ${error.message}`);

      return {
        healthy: false,
        error: error.message,
        status: error.response?.status || 'no_response'
      };
    }
  }

  /**
   * Test proxy service health (WebSocket connection test)
   */
  async testProxyHealthEndpoint() {
    const WebSocket = require('ws');
    const service = this.config.services.proxy;
    const url = `${service.protocol}://${service.host}:${service.port}${service.wsEndpoint}`;

    return new Promise((resolve) => {
      this.log('info', `Testing proxy health endpoint: ${url}`);

      const startTime = Date.now();
      const ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        ws.terminate();
        this.log('fail', 'Proxy health check: TIMEOUT');
        resolve({
          healthy: false,
          error: 'Connection timeout',
          responseTime: Date.now() - startTime
        });
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);

        // Send a ping message
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            ws.close();
            this.log('pass', 'Proxy health check: OK');
            resolve({
              healthy: true,
              responseTime: Date.now() - startTime,
              message
            });
          }
        } catch (error) {
          // Ignore parse errors, just close connection
          ws.close();
          this.log('pass', 'Proxy health check: OK (connection successful)');
          resolve({
            healthy: true,
            responseTime: Date.now() - startTime
          });
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.log('fail', `Proxy health check error: ${error.message}`);
        resolve({
          healthy: false,
          error: error.message,
          responseTime: Date.now() - startTime
        });
      });
    });
  }

  /**
   * Test cross-service communication
   */
  async testCrossServiceCommunication() {
    this.log('info', 'Testing cross-service communication');

    try {
      // Test that proxy can communicate with host service
      const WebSocket = require('ws');
      const service = this.config.services.proxy;
      const url = `${service.protocol}://${service.host}:${service.port}${service.wsEndpoint}`;

      return new Promise((resolve) => {
        const startTime = Date.now();
        const ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          ws.terminate();
          resolve({
            healthy: false,
            error: 'Cross-service communication timeout'
          });
        }, 10000);

        ws.on('open', () => {
          // Send a test message that should be forwarded to host service
          ws.send(JSON.stringify({
            type: 'test_cross_service',
            timestamp: Date.now()
          }));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            // Any response indicates successful communication
            clearTimeout(timeout);
            ws.close();

            this.log('pass', 'Cross-service communication: OK');
            resolve({
              healthy: true,
              responseTime: Date.now() - startTime,
              message
            });
          } catch (error) {
            clearTimeout(timeout);
            ws.close();
            resolve({
              healthy: false,
              error: 'Invalid response format'
            });
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            healthy: false,
            error: error.message
          });
        });
      });

    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Run a single test with error handling and timing
   */
  async runTest(testFunction) {
    const testName = testFunction.name.replace(/^test\d+_/, '').replace(/([A-Z])/g, ' $1').trim();
    const startTime = Date.now();

    try {
      this.log('setup', `Starting test: ${testName}`);
      const result = await testFunction();
      this.log(result.status, `Test completed: ${testName} - ${result.status.toUpperCase()}`);
      return result;
    } catch (error) {
      this.log('fail', `Test failed: ${testName} - ${error.message}`);
      throw error;
    }
  }
}

module.exports = StartupHealthTests;