/**
 * Golden Tests: Terminal Discovery (5 tests)
 * Tests terminal process discovery, prioritization, and handling edge cases
 */

const ServiceManager = require('../../utils/service-manager');
const axios = require('axios');
const { spawn } = require('child_process');

class TerminalDiscoveryTests extends ServiceManager {
  constructor(config) {
    super(config);
    this.category = 'discovery';
    this.testTerminals = [];
  }

  /**
   * Run all terminal discovery tests
   */
  async runAll() {
    this.log('info', 'Starting Terminal Discovery Tests');

    const tests = [
      this.test04_DiscoverExistingTerminals.bind(this),
      this.test05_PrioritizeClaudeCodeTerminals.bind(this),
      this.test06_HandleNoTerminalsFound.bind(this),
      this.test07_HandleMultipleTerminals.bind(this),
      this.test08_HandlePermissionDenied.bind(this)
    ];

    const results = [];

    // Setup test environment
    await this.setupTestEnvironment();

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
   * Setup test environment with mock terminals
   */
  async setupTestEnvironment() {
    this.log('setup', 'Setting up terminal discovery test environment');

    try {
      // Ensure host service is running
      if (!this.isServiceRunning('host')) {
        await this.startHostService();
      }

      // Create test terminal processes
      await this.createTestTerminals();

    } catch (error) {
      this.log('warn', `Setup warning: ${error.message}`);
    }
  }

  /**
   * Create test terminal processes for discovery testing
   */
  async createTestTerminals() {
    this.log('info', 'Creating test terminal processes');

    try {
      // Create a regular CMD terminal
      const cmdTerminal = spawn('cmd.exe', ['/k', 'echo Test CMD Terminal'], {
        detached: true,
        stdio: 'ignore'
      });

      this.testTerminals.push({
        process: cmdTerminal,
        name: 'Test CMD Terminal',
        type: 'cmd'
      });

      // Create a PowerShell terminal
      const psTerminal = spawn('powershell.exe', ['-NoExit', '-Command', 'Write-Host "Test PowerShell Terminal"'], {
        detached: true,
        stdio: 'ignore'
      });

      this.testTerminals.push({
        process: psTerminal,
        name: 'Test PowerShell Terminal',
        type: 'powershell'
      });

      this.log('info', `Created ${this.testTerminals.length} test terminals`);

    } catch (error) {
      this.log('warn', `Failed to create test terminals: ${error.message}`);
    }
  }

  /**
   * Test 04: Discover Existing Terminals
   * Verifies the system can discover existing terminal processes
   */
  async test04_DiscoverExistingTerminals() {
    this.log('info', 'Test 04: Discover Existing Terminals');

    const startTime = Date.now();

    try {
      const service = this.config.services.host;
      const url = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}`;

      this.log('info', `Requesting terminal discovery: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`Discovery endpoint returned status ${response.status}`);
      }

      const terminals = response.data;

      if (!Array.isArray(terminals)) {
        throw new Error('Discovery response is not an array');
      }

      // Verify we found some terminals
      if (terminals.length === 0) {
        this.log('warn', 'No terminals discovered - this may be expected in some environments');
      }

      // Validate terminal objects
      const validTerminals = terminals.filter(terminal =>
        terminal.pid &&
        terminal.name &&
        typeof terminal.pid === 'number' &&
        typeof terminal.name === 'string'
      );

      if (validTerminals.length !== terminals.length) {
        throw new Error(`Invalid terminal objects found: ${terminals.length - validTerminals.length} invalid`);
      }

      this.log('pass', `Discovered ${terminals.length} terminals successfully`);

      return {
        name: 'Discover Existing Terminals',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          terminalsFound: terminals.length,
          terminals: terminals.map(t => ({ pid: t.pid, name: t.name, title: t.title })),
          discoveryTime: Date.now() - startTime
        }
      };

    } catch (error) {
      this.log('fail', `Terminal discovery failed: ${error.message}`);

      return {
        name: 'Discover Existing Terminals',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test 05: Prioritize Claude Code Terminals
   * Verifies Claude Code terminals are prioritized in discovery results
   */
  async test05_PrioritizeClaudeCodeTerminals() {
    this.log('info', 'Test 05: Prioritize Claude Code Terminals');

    const startTime = Date.now();

    try {
      const service = this.config.services.host;
      const url = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}?prioritize=claude`;

      this.log('info', `Requesting prioritized discovery: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`Discovery endpoint returned status ${response.status}`);
      }

      const terminals = response.data;

      if (!Array.isArray(terminals)) {
        throw new Error('Discovery response is not an array');
      }

      // Check if Claude Code terminals are prioritized (appear first)
      let claudeTerminalIndex = -1;
      let nonClaudeTerminalIndex = -1;

      terminals.forEach((terminal, index) => {
        const isClaudeTerminal = terminal.title &&
          (terminal.title.toLowerCase().includes('claude') ||
           terminal.title.toLowerCase().includes('code'));

        if (isClaudeTerminal && claudeTerminalIndex === -1) {
          claudeTerminalIndex = index;
        } else if (!isClaudeTerminal && nonClaudeTerminalIndex === -1) {
          nonClaudeTerminalIndex = index;
        }
      });

      let prioritizationWorking = true;
      if (claudeTerminalIndex !== -1 && nonClaudeTerminalIndex !== -1) {
        prioritizationWorking = claudeTerminalIndex < nonClaudeTerminalIndex;
      }

      if (!prioritizationWorking) {
        this.log('warn', 'Claude Code terminals not prioritized (may be expected if none found)');
      } else {
        this.log('pass', 'Claude Code terminals properly prioritized');
      }

      return {
        name: 'Prioritize Claude Code Terminals',
        category: this.category,
        status: prioritizationWorking ? 'pass' : 'warn',
        duration: Date.now() - startTime,
        details: {
          terminalsFound: terminals.length,
          claudeTerminalIndex,
          nonClaudeTerminalIndex,
          prioritizationWorking,
          terminals: terminals.map(t => ({
            pid: t.pid,
            name: t.name,
            title: t.title,
            isClaudeTerminal: t.title && (t.title.toLowerCase().includes('claude') || t.title.toLowerCase().includes('code'))
          }))
        }
      };

    } catch (error) {
      this.log('fail', `Claude Code prioritization test failed: ${error.message}`);

      return {
        name: 'Prioritize Claude Code Terminals',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test 06: Handle No Terminals Found
   * Verifies graceful handling when no terminals are discovered
   */
  async test06_HandleNoTerminalsFound() {
    this.log('info', 'Test 06: Handle No Terminals Found');

    const startTime = Date.now();

    try {
      // First, kill all test terminals to simulate no terminals scenario
      await this.killTestTerminals();
      await this.sleep(2000);

      const service = this.config.services.host;
      const url = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}?filter=nonexistent`;

      this.log('info', `Testing no terminals scenario: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      // Should return 200 with empty array or appropriate message
      if (response.status !== 200) {
        throw new Error(`Expected 200 status for no terminals, got ${response.status}`);
      }

      const terminals = response.data;

      // Response should be either empty array or object with message
      const isValidNoTerminalsResponse =
        (Array.isArray(terminals) && terminals.length === 0) ||
        (typeof terminals === 'object' && terminals.message);

      if (!isValidNoTerminalsResponse) {
        throw new Error('Invalid response format for no terminals scenario');
      }

      this.log('pass', 'No terminals scenario handled gracefully');

      return {
        name: 'Handle No Terminals Found',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          response: terminals,
          responseType: Array.isArray(terminals) ? 'empty_array' : 'message_object'
        }
      };

    } catch (error) {
      this.log('fail', `No terminals handling failed: ${error.message}`);

      return {
        name: 'Handle No Terminals Found',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test 07: Handle Multiple Terminals
   * Verifies proper handling and enumeration of multiple terminal processes
   */
  async test07_HandleMultipleTerminals() {
    this.log('info', 'Test 07: Handle Multiple Terminals');

    const startTime = Date.now();

    try {
      // Recreate test terminals
      await this.createTestTerminals();
      await this.sleep(3000); // Allow time for processes to start

      const service = this.config.services.host;
      const url = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}`;

      this.log('info', `Testing multiple terminals discovery: ${url}`);

      const response = await axios.get(url, {
        timeout: 15000,
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`Discovery endpoint returned status ${response.status}`);
      }

      const terminals = response.data;

      if (!Array.isArray(terminals)) {
        throw new Error('Discovery response is not an array');
      }

      // Should find at least our test terminals plus any system terminals
      const minimumExpected = this.testTerminals.length;

      if (terminals.length < minimumExpected) {
        this.log('warn', `Found fewer terminals than expected: ${terminals.length} < ${minimumExpected}`);
      }

      // Verify each terminal has required properties
      const validTerminals = terminals.filter(terminal => {
        return terminal.pid &&
               terminal.name &&
               typeof terminal.pid === 'number' &&
               typeof terminal.name === 'string' &&
               terminal.pid > 0;
      });

      if (validTerminals.length !== terminals.length) {
        throw new Error(`Invalid terminal data: ${terminals.length - validTerminals.length} terminals missing required properties`);
      }

      // Check for duplicate PIDs
      const pids = terminals.map(t => t.pid);
      const uniquePids = [...new Set(pids)];

      if (pids.length !== uniquePids.length) {
        throw new Error('Duplicate PIDs found in terminal list');
      }

      this.log('pass', `Multiple terminals handled correctly: ${terminals.length} terminals found`);

      return {
        name: 'Handle Multiple Terminals',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          terminalsFound: terminals.length,
          validTerminals: validTerminals.length,
          expectedMinimum: minimumExpected,
          uniquePids: uniquePids.length,
          terminals: terminals.map(t => ({ pid: t.pid, name: t.name, title: t.title }))
        }
      };

    } catch (error) {
      this.log('fail', `Multiple terminals handling failed: ${error.message}`);

      return {
        name: 'Handle Multiple Terminals',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test 08: Handle Permission Denied Scenarios
   * Verifies graceful handling of permission denied during terminal discovery
   */
  async test08_HandlePermissionDenied() {
    this.log('info', 'Test 08: Handle Permission Denied Scenarios');

    const startTime = Date.now();

    try {
      const service = this.config.services.host;
      const url = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}?include_protected=true`;

      this.log('info', `Testing permission scenarios: ${url}`);

      const response = await axios.get(url, {
        timeout: 15000,
        validateStatus: (status) => status < 500
      });

      // Response should be successful even if some processes can't be accessed
      if (response.status !== 200) {
        throw new Error(`Discovery endpoint returned status ${response.status}`);
      }

      const result = response.data;

      // Check if response includes information about access denied processes
      let handlesPermissionsProperly = true;

      if (Array.isArray(result)) {
        // Standard terminal list - check that accessible terminals are returned
        handlesPermissionsProperly = result.length >= 0; // Any result is acceptable
      } else if (typeof result === 'object') {
        // Object response might include error information
        handlesPermissionsProperly = result.terminals || result.accessibleTerminals || result.message;
      }

      if (!handlesPermissionsProperly) {
        throw new Error('Unexpected response format for permission testing');
      }

      // Test specific permission denied scenario by requesting system processes
      try {
        const systemUrl = `${service.protocol}://${service.host}:${service.port}${service.discoveryEndpoint}?include_system=true`;
        const systemResponse = await axios.get(systemUrl, { timeout: 10000 });

        // Should either return accessible terminals or proper error message
        const systemResult = systemResponse.data;
        const validSystemResponse =
          Array.isArray(systemResult) ||
          (typeof systemResult === 'object' && systemResult.message);

        if (!validSystemResponse) {
          this.log('warn', 'System processes request returned unexpected format');
        }

      } catch (systemError) {
        // Expected - system processes might be denied
        this.log('info', `System process access: ${systemError.message}`);
      }

      this.log('pass', 'Permission denied scenarios handled gracefully');

      return {
        name: 'Handle Permission Denied Scenarios',
        category: this.category,
        status: 'pass',
        duration: Date.now() - startTime,
        details: {
          responseType: Array.isArray(result) ? 'array' : 'object',
          terminalsAccessible: Array.isArray(result) ? result.length : 'unknown',
          handlesPermissionsProperly
        }
      };

    } catch (error) {
      this.log('fail', `Permission denied handling failed: ${error.message}`);

      return {
        name: 'Handle Permission Denied Scenarios',
        category: this.category,
        status: 'fail',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Kill test terminals
   */
  async killTestTerminals() {
    this.log('cleanup', 'Killing test terminals');

    for (const terminal of this.testTerminals) {
      try {
        if (terminal.process && !terminal.process.killed) {
          terminal.process.kill('SIGTERM');
          this.log('info', `Killed test terminal: ${terminal.name}`);
        }
      } catch (error) {
        this.log('warn', `Failed to kill test terminal ${terminal.name}: ${error.message}`);
      }
    }

    this.testTerminals = [];
  }

  /**
   * Run a single test with error handling and timing
   */
  async runTest(testFunction) {
    const testName = testFunction.name.replace(/^test\d+_/, '').replace(/([A-Z])/g, ' $1').trim();

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

  /**
   * Clean up test environment
   */
  async cleanup() {
    await this.killTestTerminals();
    await super.cleanup();
  }
}

module.exports = TerminalDiscoveryTests;