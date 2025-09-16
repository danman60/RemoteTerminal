/**
 * Main test configuration for Remote Terminal Sync Testing Framework
 */

const path = require('path');

module.exports = {
  // Test execution settings
  execution: {
    timeout: 30000,           // Default test timeout (30 seconds)
    retries: 2,               // Number of retries for flaky tests
    parallel: false,          // Run tests sequentially by default
    bail: false,              // Continue running tests after failures
    verbose: process.env.DEBUG === '*'
  },

  // Test environment paths
  paths: {
    projectRoot: path.resolve(__dirname, '../../'),
    testsRoot: path.resolve(__dirname, '../'),
    reportsDir: path.resolve(__dirname, '../reports'),
    fixturesDir: path.resolve(__dirname, '../fixtures'),
    hostService: path.resolve(__dirname, '../../host-windows/src/HostService/bin/Debug/net8.0-windows/HostService.exe'),
    proxyService: path.resolve(__dirname, '../../websocket-proxy.js'),
    androidAPK: path.resolve(__dirname, '../../android-client/app/build/outputs/apk/debug/app-debug.apk')
  },

  // Service endpoints and ports
  services: {
    host: {
      port: 8080,
      healthEndpoint: '/health',
      discoveryEndpoint: '/api/terminals/discover',
      attachEndpoint: '/api/terminals/attach',
      protocol: 'http',
      host: 'localhost'
    },
    proxy: {
      port: 8081,
      wsEndpoint: '/ws',
      protocol: 'ws',
      host: 'localhost'
    },
    android: {
      packageName: 'com.rtx.app',
      activityName: '.MainActivity',
      defaultTimeout: 10000
    }
  },

  // Test categories and their configurations
  categories: {
    startup: {
      name: 'Service Startup & Health',
      timeout: 60000,
      tests: 3
    },
    discovery: {
      name: 'Terminal Discovery',
      timeout: 30000,
      tests: 5
    },
    websocket: {
      name: 'WebSocket Communication',
      timeout: 20000,
      tests: 5
    },
    attachment: {
      name: 'Terminal Attachment',
      timeout: 45000,
      tests: 4
    },
    android: {
      name: 'Android App Integration',
      timeout: 60000,
      tests: 4
    },
    security: {
      name: 'Security & Authentication',
      timeout: 30000,
      tests: 2
    },
    errors: {
      name: 'Error Handling & Edge Cases',
      timeout: 30000,
      tests: 2
    }
  },

  // Performance benchmarks
  performance: {
    serviceStartup: 5000,      // 5 seconds max startup time
    terminalDiscovery: 2000,   // 2 seconds max discovery time
    websocketConnection: 1000, // 1 second max connection time
    terminalAttachment: 3000,  // 3 seconds max attachment time
    commandLatency: 100,       // 100ms max command execution latency
    androidResponseTime: 500   // 500ms max Android app response
  },

  // Debugging and logging
  debug: {
    logLevel: process.env.LOG_LEVEL || 'info',
    logToFile: true,
    logToConsole: true,
    logFormat: 'detailed',
    saveScreenshots: true,
    saveVideos: false,
    saveNetworkLogs: true
  },

  // Test data and fixtures
  testData: {
    deviceKey: 'test-device-key-12345',
    invalidDeviceKey: 'invalid-key-99999',
    testCommands: [
      'echo "Hello, Terminal!"',
      'dir',
      'cd ..',
      'echo %PATH%',
      'whoami'
    ],
    mockTerminalProcesses: [
      { name: 'cmd.exe', pid: 1234, title: 'Command Prompt' },
      { name: 'powershell.exe', pid: 5678, title: 'Windows PowerShell' },
      { name: 'wt.exe', pid: 9012, title: 'Windows Terminal' },
      { name: 'Code.exe', pid: 3456, title: 'Claude Code Terminal' }
    ]
  },

  // Android testing configuration
  android: {
    emulator: {
      avdName: 'test_device',
      port: 5554,
      timeout: 120000
    },
    device: {
      serial: null, // Auto-detect connected device
      platform: 'Android',
      platformVersion: '13'
    },
    app: {
      installTimeout: 60000,
      launchTimeout: 30000,
      implicitWait: 5000
    }
  },

  // Security test configuration
  security: {
    certificates: {
      ca: path.resolve(__dirname, '../fixtures/certificates/ca-cert.pem'),
      server: path.resolve(__dirname, '../fixtures/certificates/server-cert.pem'),
      client: path.resolve(__dirname, '../fixtures/certificates/client-cert.pem')
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32
    }
  },

  // Error simulation configuration
  errorSimulation: {
    networkLatency: [100, 500, 1000, 2000], // ms
    packetLoss: [0, 0.1, 0.5, 1.0],        // percentage
    disconnectScenarios: [
      'sudden_disconnect',
      'graceful_disconnect',
      'network_timeout',
      'server_restart'
    ]
  }
};