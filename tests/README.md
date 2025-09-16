# Remote Terminal Sync Testing Framework

## Overview
This testing framework provides 25 "Golden Tests" that comprehensively test the remote terminal synchronization system consisting of:
- Windows Host Service (.NET) - Port 8080
- WebSocket Proxy (Node.js) - Bridge service
- Android Client - Remote control app

## Test Categories
1. **Service Startup & Health** (3 tests) - Basic service lifecycle
2. **Terminal Discovery** (5 tests) - Finding and prioritizing terminals
3. **WebSocket Communication** (5 tests) - Core connectivity and messaging
4. **Terminal Attachment** (4 tests) - Attaching to and controlling terminals
5. **Android App Integration** (4 tests) - End-to-end mobile app testing
6. **Security & Authentication** (2 tests) - Security validation
7. **Error Handling & Edge Cases** (2 tests) - Failure scenarios

## Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# Install Playwright browsers (for web-based tests)
npx playwright install

# Ensure services are available
# - Host service should be built and ready to run
# - WebSocket proxy should be available
# - Android client should be built (APK available)
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific category
npm run test:startup
npm run test:discovery
npm run test:websocket
npm run test:attachment
npm run test:android
npm run test:security
npm run test:errors

# Run with debug output
npm run test:debug

# Generate test report
npm run test:report
```

## Test Framework Structure

```
tests/
├── README.md                    # This file
├── config/
│   ├── test-config.js          # Test configuration
│   ├── services-config.js      # Service endpoints and settings
│   └── android-config.js       # Android testing configuration
├── utils/
│   ├── test-utils.js           # Common test utilities
│   ├── service-manager.js      # Service lifecycle management
│   ├── websocket-client.js     # WebSocket test client
│   ├── android-utils.js        # Android testing utilities
│   └── debug-logger.js         # Debugging and logging utilities
├── golden-tests/
│   ├── 01-startup-health/      # Service startup & health tests
│   ├── 02-terminal-discovery/  # Terminal discovery tests
│   ├── 03-websocket-comm/      # WebSocket communication tests
│   ├── 04-terminal-attachment/ # Terminal attachment tests
│   ├── 05-android-integration/ # Android app integration tests
│   ├── 06-security-auth/       # Security & authentication tests
│   └── 07-error-handling/      # Error handling & edge cases
├── fixtures/
│   ├── test-data/              # Test data files
│   ├── mock-terminals/         # Mock terminal configurations
│   └── certificates/           # Test certificates
├── reports/                    # Test output and reports
└── package.json               # Test dependencies and scripts
```

## Debugging Language

The framework uses a structured debugging language for consistent test output:

### Test Status Indicators
- `🟢 PASS` - Test passed successfully
- `🔴 FAIL` - Test failed with errors
- `🟡 WARN` - Test passed with warnings
- `⚪ SKIP` - Test skipped due to prerequisites
- `🔵 INFO` - Informational message
- `⚙️ SETUP` - Test setup operations
- `🧹 CLEANUP` - Test cleanup operations

### Service Status
- `🚀 STARTING` - Service is starting up
- `✅ RUNNING` - Service is running normally
- `⏹️ STOPPING` - Service is shutting down
- `❌ FAILED` - Service failed to start/run
- `🔄 RESTARTING` - Service is restarting

### Connection Status
- `🔌 CONNECTING` - Establishing connection
- `🔗 CONNECTED` - Connection established
- `📡 SENDING` - Sending data
- `📥 RECEIVING` - Receiving data
- `🔌 DISCONNECTED` - Connection closed
- `⚠️ TIMEOUT` - Connection timeout

## CI/CD Integration

### GitHub Actions
```yaml
# Add to .github/workflows/test.yml
name: Remote Terminal Sync Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-reports
          path: tests/reports/
```

### Jenkins Pipeline
```groovy
pipeline {
    agent { label 'windows' }
    stages {
        stage('Test') {
            steps {
                dir('remote-terminal-sync/tests') {
                    bat 'npm install'
                    bat 'npm test'
                }
            }
            post {
                always {
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'tests/reports',
                        reportFiles: 'index.html',
                        reportName: 'Test Report'
                    ])
                }
            }
        }
    }
}
```

## Performance Benchmarks

Expected performance targets:
- Service startup: < 5 seconds
- Terminal discovery: < 2 seconds
- WebSocket connection: < 1 second
- Terminal attachment: < 3 seconds
- Command execution latency: < 100ms
- Android app response time: < 500ms

## Troubleshooting

### Common Issues
1. **Port conflicts** - Ensure ports 8080+ are available
2. **Permissions** - Run as administrator for terminal access
3. **Firewall** - Allow services through Windows Firewall
4. **Android connection** - Ensure device and host on same network
5. **WebSocket failures** - Check proxy service logs

### Debug Commands
```bash
# Check service status
npm run test:health-check

# Test individual components
npm run test:host-only
npm run test:proxy-only
npm run test:android-only

# Verbose logging
DEBUG=* npm test

# Generate diagnostic report
npm run test:diagnose
```