#!/usr/bin/env node

/**
 * Main Test Runner for Remote Terminal Sync Testing Framework
 * Executes the 25 Golden Tests across all categories
 */

const { program } = require('commander');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

// Import test categories
const StartupHealthTests = require('./golden-tests/01-startup-health');
const TerminalDiscoveryTests = require('./golden-tests/02-terminal-discovery');
const WebSocketCommTests = require('./golden-tests/03-websocket-comm');
const TerminalAttachmentTests = require('./golden-tests/04-terminal-attachment');
const AndroidIntegrationTests = require('./golden-tests/05-android-integration');
const SecurityAuthTests = require('./golden-tests/06-security-auth');
const ErrorHandlingTests = require('./golden-tests/07-error-handling');

// Import configuration
const config = require('./config/test-config');

class TestRunner {
  constructor() {
    this.config = config;
    this.results = [];
    this.startTime = Date.now();
    this.testCategories = new Map([
      ['startup', StartupHealthTests],
      ['discovery', TerminalDiscoveryTests],
      ['websocket', WebSocketCommTests],
      ['attachment', TerminalAttachmentTests],
      ['android', AndroidIntegrationTests],
      ['security', SecurityAuthTests],
      ['errors', ErrorHandlingTests]
    ]);
  }

  /**
   * Run all tests or specific category/service
   */
  async run(options = {}) {
    try {
      await this.initialize();
      await this.executeTests(options);
      await this.generateReport();
      await this.cleanup();

      this.printSummary();
      process.exit(this.getExitCode());

    } catch (error) {
      console.error(chalk.red(`💥 Test runner failed: ${error.message}`));
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Initialize test environment
   */
  async initialize() {
    console.log(chalk.blue('🧪 Remote Terminal Sync Testing Framework'));
    console.log(chalk.gray('====================================='));
    console.log();

    // Ensure reports directory exists
    await fs.ensureDir(this.config.paths.reportsDir);

    // Log system information
    const deviceInfo = {
      platform: process.platform,
      nodeVersion: process.version,
      cwd: process.cwd(),
      timestamp: new Date().toISOString()
    };

    console.log(chalk.blue('📋 System Information:'));
    console.log(`   Platform: ${deviceInfo.platform}`);
    console.log(`   Node.js: ${deviceInfo.nodeVersion}`);
    console.log(`   Working Directory: ${deviceInfo.cwd}`);
    console.log(`   Started: ${deviceInfo.timestamp}`);
    console.log();
  }

  /**
   * Execute tests based on options
   */
  async executeTests(options) {
    const { category, service } = options;

    if (category) {
      await this.runCategory(category);
    } else if (service) {
      await this.runServiceTests(service);
    } else {
      await this.runAllTests();
    }
  }

  /**
   * Run all test categories
   */
  async runAllTests() {
    console.log(chalk.green('🚀 Running All Golden Tests (25 tests)'));
    console.log();

    for (const [categoryName, TestClass] of this.testCategories) {
      try {
        await this.runCategory(categoryName);
      } catch (error) {
        console.error(chalk.red(`❌ Category '${categoryName}' failed: ${error.message}`));
      }
    }
  }

  /**
   * Run specific test category
   */
  async runCategory(categoryName) {
    const TestClass = this.testCategories.get(categoryName);
    if (!TestClass) {
      throw new Error(`Unknown test category: ${categoryName}`);
    }

    const categoryConfig = this.config.categories[categoryName];
    console.log(chalk.yellow(`📂 Running ${categoryConfig.name} Tests`));
    console.log(chalk.gray(`   Expected: ${categoryConfig.tests} tests`));
    console.log();

    const testInstance = new TestClass(this.config);
    const categoryResults = await testInstance.runAll();

    this.results.push(...categoryResults);

    // Print category summary
    const passed = categoryResults.filter(r => r.status === 'pass').length;
    const failed = categoryResults.filter(r => r.status === 'fail').length;
    const skipped = categoryResults.filter(r => r.status === 'skip').length;

    console.log();
    console.log(chalk.blue(`📊 ${categoryConfig.name} Summary:`));
    console.log(`   ${chalk.green(`✅ Passed: ${passed}`)}`);
    console.log(`   ${chalk.red(`❌ Failed: ${failed}`)}`);
    console.log(`   ${chalk.gray(`⚪ Skipped: ${skipped}`)}`);
    console.log();
  }

  /**
   * Run tests for specific service only
   */
  async runServiceTests(serviceName) {
    console.log(chalk.yellow(`🔧 Running ${serviceName} Service Tests`));
    console.log();

    const serviceCategories = this.getServiceCategories(serviceName);

    for (const categoryName of serviceCategories) {
      await this.runCategory(categoryName);
    }
  }

  /**
   * Get test categories relevant to specific service
   */
  getServiceCategories(serviceName) {
    switch (serviceName) {
      case 'host':
        return ['startup', 'discovery', 'attachment'];
      case 'proxy':
        return ['startup', 'websocket', 'security'];
      case 'android':
        return ['android'];
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }

  /**
   * Generate comprehensive test report
   */
  async generateReport() {
    console.log(chalk.blue('📝 Generating Test Report...'));

    const report = {
      metadata: {
        framework: 'Remote Terminal Sync Testing Framework',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        duration: Date.now() - this.startTime,
        platform: process.platform,
        nodeVersion: process.version
      },
      summary: this.calculateSummary(),
      results: this.results,
      performance: this.analyzePerformance(),
      recommendations: this.generateRecommendations()
    };

    // Write JSON report
    const jsonPath = path.join(this.config.paths.reportsDir, 'latest-test-report.json');
    await fs.writeJSON(jsonPath, report, { spaces: 2 });

    // Write HTML report
    const htmlPath = path.join(this.config.paths.reportsDir, 'latest-test-report.html');
    await this.generateHTMLReport(report, htmlPath);

    console.log(chalk.green(`   Report saved: ${htmlPath}`));
  }

  /**
   * Calculate test summary statistics
   */
  calculateSummary() {
    const summary = {
      total: this.results.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      warnings: 0,
      categories: {}
    };

    this.results.forEach(result => {
      // Overall counts
      switch (result.status) {
        case 'pass':
          summary.passed++;
          break;
        case 'fail':
          summary.failed++;
          break;
        case 'skip':
          summary.skipped++;
          break;
        case 'warn':
          summary.warnings++;
          break;
      }

      // Category counts
      if (!summary.categories[result.category]) {
        summary.categories[result.category] = {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0
        };
      }

      summary.categories[result.category].total++;
      if (result.status === 'pass') summary.categories[result.category].passed++;
      if (result.status === 'fail') summary.categories[result.category].failed++;
      if (result.status === 'skip') summary.categories[result.category].skipped++;
    });

    summary.passRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(1) : 0;
    summary.health = this.calculateSystemHealth();

    return summary;
  }

  /**
   * Analyze performance metrics
   */
  analyzePerformance() {
    const performance = {
      totalDuration: Date.now() - this.startTime,
      averageTestDuration: 0,
      slowestTests: [],
      benchmarkComparison: {}
    };

    if (this.results.length > 0) {
      const totalTestTime = this.results.reduce((sum, result) => sum + (result.duration || 0), 0);
      performance.averageTestDuration = totalTestTime / this.results.length;

      // Find slowest tests
      performance.slowestTests = this.results
        .filter(result => result.duration)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(result => ({
          name: result.name,
          duration: result.duration,
          category: result.category
        }));

      // Compare against benchmarks
      const benchmarks = this.config.performance;
      performance.benchmarkComparison = {
        serviceStartup: this.compareAgainstBenchmark('service_startup', benchmarks.serviceStartup),
        terminalDiscovery: this.compareAgainstBenchmark('terminal_discovery', benchmarks.terminalDiscovery),
        websocketConnection: this.compareAgainstBenchmark('websocket_connection', benchmarks.websocketConnection),
        commandLatency: this.compareAgainstBenchmark('command_latency', benchmarks.commandLatency)
      };
    }

    return performance;
  }

  /**
   * Compare test result against benchmark
   */
  compareAgainstBenchmark(testType, benchmark) {
    const relevantResults = this.results.filter(result =>
      result.name.toLowerCase().includes(testType.replace('_', ' '))
    );

    if (relevantResults.length === 0) {
      return { status: 'no_data', benchmark };
    }

    const averageDuration = relevantResults.reduce((sum, result) => sum + (result.duration || 0), 0) / relevantResults.length;

    return {
      status: averageDuration <= benchmark ? 'pass' : 'fail',
      benchmark,
      actual: averageDuration,
      difference: averageDuration - benchmark
    };
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];

    const summary = this.calculateSummary();

    // Overall health recommendations
    if (summary.passRate < 80) {
      recommendations.push({
        type: 'critical',
        title: 'Low Pass Rate',
        description: `Only ${summary.passRate}% of tests are passing. System stability is at risk.`,
        actions: [
          'Review failed tests immediately',
          'Check service configurations',
          'Verify network connectivity',
          'Review recent code changes'
        ]
      });
    }

    // Category-specific recommendations
    Object.entries(summary.categories).forEach(([category, stats]) => {
      const categoryPassRate = stats.total > 0 ? (stats.passed / stats.total * 100) : 0;

      if (categoryPassRate < 50) {
        recommendations.push({
          type: 'high',
          title: `${category} Category Issues`,
          description: `${category} tests are failing at ${(100 - categoryPassRate).toFixed(1)}% rate`,
          actions: this.getCategorySpecificActions(category)
        });
      }
    });

    // Performance recommendations
    const performance = this.analyzePerformance();
    Object.entries(performance.benchmarkComparison).forEach(([metric, comparison]) => {
      if (comparison.status === 'fail') {
        recommendations.push({
          type: 'medium',
          title: `Performance Issue: ${metric}`,
          description: `${metric} is ${comparison.difference.toFixed(0)}ms slower than benchmark`,
          actions: this.getPerformanceActions(metric)
        });
      }
    });

    return recommendations;
  }

  /**
   * Get category-specific troubleshooting actions
   */
  getCategorySpecificActions(category) {
    const actions = {
      startup: [
        'Check if services can bind to configured ports',
        'Verify service executables exist and are accessible',
        'Check Windows Firewall settings',
        'Ensure required dependencies are installed'
      ],
      discovery: [
        'Verify terminal processes are running',
        'Check process enumeration permissions',
        'Test Windows API access for terminal discovery',
        'Review terminal detection logic'
      ],
      websocket: [
        'Test WebSocket proxy connectivity',
        'Check network configuration between services',
        'Verify WebSocket protocol implementation',
        'Review message serialization/deserialization'
      ],
      attachment: [
        'Check ConPTY API functionality',
        'Verify terminal process attachment permissions',
        'Test pseudoconsole creation',
        'Review I/O redirection implementation'
      ],
      android: [
        'Ensure Android device is connected and accessible',
        'Check ADB connectivity',
        'Verify app installation and permissions',
        'Test network connectivity from device'
      ],
      security: [
        'Review authentication implementation',
        'Check certificate configuration',
        'Verify encryption/decryption functions',
        'Test security policies and access controls'
      ],
      errors: [
        'Review error handling logic',
        'Test edge case scenarios',
        'Check graceful degradation',
        'Verify recovery mechanisms'
      ]
    };

    return actions[category] || ['Review test implementation and system requirements'];
  }

  /**
   * Get performance-specific actions
   */
  getPerformanceActions(metric) {
    const actions = {
      service_startup: [
        'Optimize service initialization',
        'Reduce startup dependencies',
        'Implement lazy loading',
        'Profile startup bottlenecks'
      ],
      terminal_discovery: [
        'Cache terminal process information',
        'Optimize process enumeration',
        'Implement parallel discovery',
        'Add discovery result caching'
      ],
      websocket_connection: [
        'Optimize WebSocket handshake',
        'Review connection pooling',
        'Check network latency',
        'Implement connection reuse'
      ],
      command_latency: [
        'Optimize I/O operations',
        'Reduce message processing overhead',
        'Implement command batching',
        'Profile execution pipeline'
      ]
    };

    return actions[metric] || ['Profile and optimize the specific functionality'];
  }

  /**
   * Calculate overall system health score
   */
  calculateSystemHealth() {
    const summary = this.calculateSummary();

    if (summary.total === 0) return 'unknown';

    const passRate = parseFloat(summary.passRate);

    if (passRate >= 95) return 'excellent';
    if (passRate >= 85) return 'good';
    if (passRate >= 70) return 'fair';
    if (passRate >= 50) return 'poor';
    return 'critical';
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(report, outputPath) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remote Terminal Sync - Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; color: #333; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin: 2rem 0; }
        .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric { text-align: center; }
        .metric-value { font-size: 2.5rem; font-weight: bold; margin: 0.5rem 0; }
        .health-excellent { color: #28a745; }
        .health-good { color: #17a2b8; }
        .health-fair { color: #ffc107; }
        .health-poor { color: #fd7e14; }
        .health-critical { color: #dc3545; }
        .test-result { background: white; margin: 1rem 0; padding: 1rem; border-radius: 8px; border-left: 4px solid #ccc; }
        .test-pass { border-left-color: #28a745; }
        .test-fail { border-left-color: #dc3545; }
        .test-skip { border-left-color: #6c757d; }
        .test-warn { border-left-color: #ffc107; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeeba; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
        .recommendation-critical { background: #f8d7da; border-color: #f5c6cb; }
        .recommendation-high { background: #fff3cd; border-color: #ffeeba; }
        .recommendation-medium { background: #d1ecf1; border-color: #bee5eb; }
        .performance-chart { background: white; padding: 1.5rem; border-radius: 8px; margin: 1rem 0; }
        .benchmark-pass { color: #28a745; }
        .benchmark-fail { color: #dc3545; }
        .tabs { background: white; border-radius: 8px; overflow: hidden; margin: 2rem 0; }
        .tab-header { display: flex; background: #f8f9fa; }
        .tab-button { flex: 1; padding: 1rem; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; }
        .tab-button.active { background: white; border-bottom-color: #667eea; }
        .tab-content { padding: 2rem; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Remote Terminal Sync Test Report</h1>
        <p>Generated: ${report.metadata.timestamp}</p>
        <p>Duration: ${(report.metadata.duration / 1000).toFixed(2)} seconds</p>
    </div>

    <div class="container">
        <div class="summary-grid">
            <div class="card metric">
                <h3>Total Tests</h3>
                <div class="metric-value">${report.summary.total}</div>
            </div>
            <div class="card metric">
                <h3>Pass Rate</h3>
                <div class="metric-value health-${report.summary.health}">${report.summary.passRate}%</div>
            </div>
            <div class="card metric">
                <h3>System Health</h3>
                <div class="metric-value health-${report.summary.health}">${report.summary.health.toUpperCase()}</div>
            </div>
            <div class="card metric">
                <h3>Passed</h3>
                <div class="metric-value" style="color: #28a745">${report.summary.passed}</div>
            </div>
            <div class="card metric">
                <h3>Failed</h3>
                <div class="metric-value" style="color: #dc3545">${report.summary.failed}</div>
            </div>
            <div class="card metric">
                <h3>Skipped</h3>
                <div class="metric-value" style="color: #6c757d">${report.summary.skipped}</div>
            </div>
        </div>

        <div class="tabs">
            <div class="tab-header">
                <button class="tab-button active" onclick="showTab('results')">Test Results</button>
                <button class="tab-button" onclick="showTab('performance')">Performance</button>
                <button class="tab-button" onclick="showTab('recommendations')">Recommendations</button>
                <button class="tab-button" onclick="showTab('categories')">Categories</button>
            </div>

            <div class="tab-content">
                <div id="results" class="tab-panel active">
                    <h2>Test Results</h2>
                    ${report.results.map(result => `
                        <div class="test-result test-${result.status}">
                            <h3>${result.name}</h3>
                            <p><strong>Category:</strong> ${result.category}</p>
                            <p><strong>Status:</strong> ${result.status.toUpperCase()}</p>
                            <p><strong>Duration:</strong> ${result.duration || 0}ms</p>
                            ${result.error ? `<p><strong>Error:</strong> ${result.error}</p>` : ''}
                            ${result.details ? `<details><summary>Details</summary><pre>${JSON.stringify(result.details, null, 2)}</pre></details>` : ''}
                        </div>
                    `).join('')}
                </div>

                <div id="performance" class="tab-panel">
                    <h2>Performance Analysis</h2>
                    <div class="performance-chart">
                        <h3>Benchmark Comparison</h3>
                        ${Object.entries(report.performance.benchmarkComparison).map(([metric, comparison]) => `
                            <p class="benchmark-${comparison.status}">
                                <strong>${metric}:</strong>
                                ${comparison.actual ? comparison.actual.toFixed(0) : 'N/A'}ms
                                (benchmark: ${comparison.benchmark}ms)
                                ${comparison.status === 'fail' ? ` - ${comparison.difference.toFixed(0)}ms over` : ''}
                            </p>
                        `).join('')}
                    </div>
                    ${report.performance.slowestTests.length > 0 ? `
                        <div class="performance-chart">
                            <h3>Slowest Tests</h3>
                            ${report.performance.slowestTests.map(test => `
                                <p>${test.name} - ${test.duration}ms (${test.category})</p>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <div id="recommendations" class="tab-panel">
                    <h2>Recommendations</h2>
                    ${report.recommendations.map(rec => `
                        <div class="recommendations recommendation-${rec.type}">
                            <h3>${rec.title}</h3>
                            <p>${rec.description}</p>
                            <h4>Recommended Actions:</h4>
                            <ul>
                                ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>

                <div id="categories" class="tab-panel">
                    <h2>Category Summary</h2>
                    ${Object.entries(report.summary.categories).map(([category, stats]) => `
                        <div class="card">
                            <h3>${category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                            <p>Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed} | Skipped: ${stats.skipped}</p>
                            <p>Pass Rate: ${stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(1) : 0}%</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </div>

    <script>
        function showTab(tabName) {
            // Hide all panels
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.remove('active');
            });

            // Remove active from all buttons
            document.querySelectorAll('.tab-button').forEach(button => {
                button.classList.remove('active');
            });

            // Show selected panel and activate button
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }
    </script>
</body>
</html>`;

    await fs.writeFile(outputPath, html);
  }

  /**
   * Print test summary to console
   */
  printSummary() {
    const summary = this.calculateSummary();
    const duration = (Date.now() - this.startTime) / 1000;

    console.log();
    console.log(chalk.blue('🎯 Test Summary'));
    console.log(chalk.gray('================='));
    console.log();
    console.log(`   ${chalk.green(`✅ Passed: ${summary.passed}`)} / ${summary.total}`);
    console.log(`   ${chalk.red(`❌ Failed: ${summary.failed}`)} / ${summary.total}`);
    console.log(`   ${chalk.gray(`⚪ Skipped: ${summary.skipped}`)} / ${summary.total}`);
    console.log();
    console.log(`   ${chalk.blue(`📊 Pass Rate: ${summary.passRate}%`)}`);
    console.log(`   ${chalk.blue(`🏥 System Health: ${summary.health.toUpperCase()}`)}`);
    console.log(`   ${chalk.blue(`⏱️  Duration: ${duration.toFixed(2)}s`)}`);
    console.log();

    if (summary.failed > 0) {
      console.log(chalk.red('❌ Failed Tests:'));
      const failedTests = this.results.filter(r => r.status === 'fail');
      failedTests.forEach(test => {
        console.log(chalk.red(`   • ${test.name} (${test.category})`));
        if (test.error) {
          console.log(chalk.gray(`     Error: ${test.error}`));
        }
      });
      console.log();
    }
  }

  /**
   * Get exit code based on test results
   */
  getExitCode() {
    const summary = this.calculateSummary();
    return summary.failed > 0 ? 1 : 0;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Override in specific implementations
  }
}

// CLI Setup
program
  .name('test-runner')
  .description('Remote Terminal Sync Testing Framework')
  .version('1.0.0');

program
  .option('-c, --category <category>', 'Run specific test category')
  .option('-s, --service <service>', 'Run tests for specific service')
  .option('-r, --report', 'Generate detailed report')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    if (options.verbose) {
      process.env.DEBUG = '*';
    }

    const runner = new TestRunner();
    await runner.run(options);
  });

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('💥 Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('💥 Unhandled Rejection:'), reason);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  program.parse();
}

module.exports = TestRunner;