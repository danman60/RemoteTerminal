/**
 * Common test utilities for Remote Terminal Sync Testing Framework
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const chalk = require('chalk');

class TestUtils {
  constructor(config) {
    this.config = config;
    this.testId = uuidv4();
    this.startTime = Date.now();
    this.logs = [];
  }

  /**
   * Log a message with timestamp and formatting
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      testId: this.testId
    };

    this.logs.push(logEntry);

    if (this.config.debug.logToConsole) {
      this.formatConsoleLog(logEntry);
    }

    if (this.config.debug.logToFile) {
      this.writeLogToFile(logEntry);
    }
  }

  /**
   * Format and display console log with colors and emojis
   */
  formatConsoleLog(logEntry) {
    const { timestamp, level, message, data } = logEntry;
    const time = new Date(timestamp).toLocaleTimeString();

    let emoji, color;
    switch (level) {
      case 'pass':
        emoji = '🟢';
        color = chalk.green;
        break;
      case 'fail':
        emoji = '🔴';
        color = chalk.red;
        break;
      case 'warn':
        emoji = '🟡';
        color = chalk.yellow;
        break;
      case 'skip':
        emoji = '⚪';
        color = chalk.gray;
        break;
      case 'info':
        emoji = '🔵';
        color = chalk.blue;
        break;
      case 'setup':
        emoji = '⚙️';
        color = chalk.cyan;
        break;
      case 'cleanup':
        emoji = '🧹';
        color = chalk.magenta;
        break;
      case 'starting':
        emoji = '🚀';
        color = chalk.yellow;
        break;
      case 'running':
        emoji = '✅';
        color = chalk.green;
        break;
      case 'stopping':
        emoji = '⏹️';
        color = chalk.orange;
        break;
      case 'failed':
        emoji = '❌';
        color = chalk.red;
        break;
      case 'connecting':
        emoji = '🔌';
        color = chalk.blue;
        break;
      case 'connected':
        emoji = '🔗';
        color = chalk.green;
        break;
      case 'sending':
        emoji = '📡';
        color = chalk.cyan;
        break;
      case 'receiving':
        emoji = '📥';
        color = chalk.blue;
        break;
      case 'disconnected':
        emoji = '🔌';
        color = chalk.gray;
        break;
      case 'timeout':
        emoji = '⚠️';
        color = chalk.red;
        break;
      default:
        emoji = '📝';
        color = chalk.white;
    }

    console.log(`${chalk.gray(time)} ${emoji} ${color(level.toUpperCase())} ${message}`);

    if (data && this.config.debug.logLevel === 'verbose') {
      console.log(chalk.gray('  Data:'), JSON.stringify(data, null, 2));
    }
  }

  /**
   * Write log entry to file
   */
  async writeLogToFile(logEntry) {
    const logDir = path.join(this.config.paths.reportsDir, 'logs');
    await fs.ensureDir(logDir);

    const logFile = path.join(logDir, `test-${this.testId}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';

    await fs.appendFile(logFile, logLine);
  }

  /**
   * Wait for a condition to be true with timeout
   */
  async waitFor(condition, timeout = 10000, interval = 500) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        if (await condition()) {
          return true;
        }
      } catch (error) {
        // Condition check failed, continue waiting
      }

      await this.sleep(interval);
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry operation with exponential backoff
   */
  async retry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log('info', `Attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error;
        this.log('warn', `Attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          this.log('info', `Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Generate test report
   */
  async generateReport(results) {
    const reportDir = this.config.paths.reportsDir;
    await fs.ensureDir(reportDir);

    const report = {
      testId: this.testId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      results,
      summary: this.calculateSummary(results),
      logs: this.logs
    };

    // Write JSON report
    const jsonReportPath = path.join(reportDir, `test-report-${this.testId}.json`);
    await fs.writeJSON(jsonReportPath, report, { spaces: 2 });

    // Write HTML report
    const htmlReportPath = path.join(reportDir, `test-report-${this.testId}.html`);
    await this.generateHTMLReport(report, htmlReportPath);

    this.log('info', `Test report generated: ${htmlReportPath}`);

    return report;
  }

  /**
   * Calculate test summary statistics
   */
  calculateSummary(results) {
    const summary = {
      total: results.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      warnings: 0
    };

    results.forEach(result => {
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
    });

    summary.passRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(1) : 0;

    return summary;
  }

  /**
   * Generate HTML test report
   */
  async generateHTMLReport(report, outputPath) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remote Terminal Sync Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; }
        .summary-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex: 1; }
        .test-result { background: white; margin: 10px 0; padding: 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .pass { border-left: 5px solid #27ae60; }
        .fail { border-left: 5px solid #e74c3c; }
        .skip { border-left: 5px solid #95a5a6; }
        .warn { border-left: 5px solid #f39c12; }
        .test-details { margin-top: 10px; }
        .logs { background: #2c3e50; color: #ecf0f1; padding: 10px; border-radius: 3px; font-family: monospace; max-height: 300px; overflow-y: auto; }
        .timestamp { color: #bdc3c7; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Remote Terminal Sync Test Report</h1>
        <p>Test ID: ${report.testId}</p>
        <p>Generated: ${report.timestamp}</p>
        <p>Duration: ${(report.duration / 1000).toFixed(2)} seconds</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <h3>📊 Summary</h3>
            <p><strong>Total Tests:</strong> ${report.summary.total}</p>
            <p><strong>Pass Rate:</strong> ${report.summary.passRate}%</p>
        </div>
        <div class="summary-card">
            <h3>✅ Passed</h3>
            <p style="font-size: 2em; color: #27ae60;">${report.summary.passed}</p>
        </div>
        <div class="summary-card">
            <h3>❌ Failed</h3>
            <p style="font-size: 2em; color: #e74c3c;">${report.summary.failed}</p>
        </div>
        <div class="summary-card">
            <h3>⚪ Skipped</h3>
            <p style="font-size: 2em; color: #95a5a6;">${report.summary.skipped}</p>
        </div>
    </div>

    <h2>📋 Test Results</h2>
    ${report.results.map(result => `
        <div class="test-result ${result.status}">
            <h3>${result.name}</h3>
            <p><strong>Status:</strong> ${result.status.toUpperCase()}</p>
            <p><strong>Duration:</strong> ${result.duration}ms</p>
            ${result.error ? `<p><strong>Error:</strong> ${result.error}</p>` : ''}
            ${result.details ? `
                <div class="test-details">
                    <h4>Details:</h4>
                    <pre>${JSON.stringify(result.details, null, 2)}</pre>
                </div>
            ` : ''}
        </div>
    `).join('')}

    <h2>📝 Test Logs</h2>
    <div class="logs">
        ${report.logs.map(log => `
            <div>
                <span class="timestamp">${log.timestamp}</span>
                [${log.level.toUpperCase()}] ${log.message}
                ${log.data ? `\n  Data: ${JSON.stringify(log.data)}` : ''}
            </div>
        `).join('\n')}
    </div>
</body>
</html>`;

    await fs.writeFile(outputPath, html);
  }

  /**
   * Take screenshot (for Playwright tests)
   */
  async takeScreenshot(page, name) {
    if (!this.config.debug.saveScreenshots) return;

    const screenshotDir = path.join(this.config.paths.reportsDir, 'screenshots');
    await fs.ensureDir(screenshotDir);

    const screenshotPath = path.join(screenshotDir, `${name}-${this.testId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    this.log('info', `Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  /**
   * Clean up test resources
   */
  async cleanup() {
    this.log('cleanup', 'Cleaning up test resources');
    // Override in specific test classes
  }
}

module.exports = TestUtils;