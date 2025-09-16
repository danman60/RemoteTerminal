/**
 * Android Testing Utilities for Remote Terminal Sync Testing
 */

const adb = require('adb-kit');
const { spawn, exec } = require('child_process');
const path = require('path');
const TestUtils = require('./test-utils');

class AndroidTestUtils extends TestUtils {
  constructor(config) {
    super(config);
    this.adbClient = null;
    this.connectedDevices = [];
    this.currentDevice = null;
  }

  /**
   * Initialize ADB client and connect to devices
   */
  async initialize() {
    this.log('setup', 'Initializing Android testing environment');

    try {
      this.adbClient = adb.createClient();
      await this.discoverDevices();
      return true;
    } catch (error) {
      this.log('failed', `Failed to initialize ADB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover connected Android devices
   */
  async discoverDevices() {
    this.log('info', 'Discovering Android devices');

    try {
      const devices = await this.adbClient.listDevices();
      this.connectedDevices = devices.filter(device => device.type === 'device');

      this.log('info', `Found ${this.connectedDevices.length} connected devices`);

      if (this.connectedDevices.length === 0) {
        throw new Error('No Android devices connected');
      }

      // Use the first available device
      this.currentDevice = this.connectedDevices[0];
      this.log('info', `Using device: ${this.currentDevice.id}`);

      return this.connectedDevices;
    } catch (error) {
      this.log('failed', `Failed to discover devices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install APK on device
   */
  async installAPK() {
    const apkPath = this.config.paths.androidAPK;
    this.log('info', `Installing APK: ${apkPath}`);

    try {
      await this.adbClient.install(this.currentDevice.id, apkPath);
      this.log('info', 'APK installed successfully');
      return true;
    } catch (error) {
      this.log('failed', `Failed to install APK: ${error.message}`);
      throw error;
    }
  }

  /**
   * Uninstall app from device
   */
  async uninstallApp() {
    const packageName = this.config.services.android.packageName;
    this.log('info', `Uninstalling app: ${packageName}`);

    try {
      await this.adbClient.uninstall(this.currentDevice.id, packageName);
      this.log('info', 'App uninstalled successfully');
      return true;
    } catch (error) {
      this.log('warn', `Failed to uninstall app: ${error.message}`);
      // Don't throw error if app wasn't installed
      return false;
    }
  }

  /**
   * Launch the app
   */
  async launchApp() {
    const packageName = this.config.services.android.packageName;
    const activityName = this.config.services.android.activityName;
    const fullActivity = `${packageName}${activityName}`;

    this.log('info', `Launching app: ${fullActivity}`);

    try {
      await this.adbClient.startActivity(this.currentDevice.id, {
        action: 'android.intent.action.MAIN',
        category: 'android.intent.category.LAUNCHER',
        component: fullActivity
      });

      this.log('info', 'App launched successfully');

      // Wait for app to start
      await this.sleep(3000);

      return true;
    } catch (error) {
      this.log('failed', `Failed to launch app: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the app
   */
  async stopApp() {
    const packageName = this.config.services.android.packageName;
    this.log('info', `Stopping app: ${packageName}`);

    try {
      await this.adbClient.shell(this.currentDevice.id, `am force-stop ${packageName}`);
      this.log('info', 'App stopped successfully');
      return true;
    } catch (error) {
      this.log('warn', `Failed to stop app: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if app is running
   */
  async isAppRunning() {
    const packageName = this.config.services.android.packageName;

    try {
      const output = await this.adbClient.shell(this.currentDevice.id,
        `ps | grep ${packageName}`);

      return output.toString().includes(packageName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Simulate tap at coordinates
   */
  async tap(x, y) {
    this.log('info', `Tapping at coordinates: (${x}, ${y})`);

    try {
      await this.adbClient.shell(this.currentDevice.id, `input tap ${x} ${y}`);
      await this.sleep(500); // Wait for tap to register
      return true;
    } catch (error) {
      this.log('failed', `Failed to tap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send text input
   */
  async sendText(text) {
    this.log('info', `Sending text: ${text}`);

    try {
      // Escape special characters
      const escapedText = text.replace(/ /g, '%s').replace(/'/g, "\\'");
      await this.adbClient.shell(this.currentDevice.id, `input text '${escapedText}'`);
      await this.sleep(500);
      return true;
    } catch (error) {
      this.log('failed', `Failed to send text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Press hardware key
   */
  async pressKey(keyCode) {
    this.log('info', `Pressing key: ${keyCode}`);

    try {
      await this.adbClient.shell(this.currentDevice.id, `input keyevent ${keyCode}`);
      await this.sleep(300);
      return true;
    } catch (error) {
      this.log('failed', `Failed to press key: ${error.message}`);
      throw error;
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filename) {
    this.log('info', `Taking screenshot: ${filename}`);

    try {
      const screenshotDir = path.join(this.config.paths.reportsDir, 'android-screenshots');
      await require('fs-extra').ensureDir(screenshotDir);

      const remotePath = '/sdcard/screenshot.png';
      const localPath = path.join(screenshotDir, `${filename}-${this.testId}.png`);

      // Take screenshot on device
      await this.adbClient.shell(this.currentDevice.id, `screencap -p ${remotePath}`);

      // Pull screenshot to local machine
      await this.adbClient.pull(this.currentDevice.id, remotePath, localPath);

      // Clean up remote file
      await this.adbClient.shell(this.currentDevice.id, `rm ${remotePath}`);

      this.log('info', `Screenshot saved: ${localPath}`);
      return localPath;
    } catch (error) {
      this.log('failed', `Failed to take screenshot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get app logs
   */
  async getAppLogs(lines = 100) {
    const packageName = this.config.services.android.packageName;
    this.log('info', `Getting app logs (${lines} lines)`);

    try {
      const output = await this.adbClient.shell(this.currentDevice.id,
        `logcat -t ${lines} | grep ${packageName}`);

      return output.toString();
    } catch (error) {
      this.log('warn', `Failed to get app logs: ${error.message}`);
      return '';
    }
  }

  /**
   * Clear app logs
   */
  async clearLogs() {
    try {
      await this.adbClient.shell(this.currentDevice.id, 'logcat -c');
      this.log('info', 'App logs cleared');
    } catch (error) {
      this.log('warn', `Failed to clear logs: ${error.message}`);
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo() {
    try {
      const [model, androidVersion, apiLevel] = await Promise.all([
        this.adbClient.shell(this.currentDevice.id, 'getprop ro.product.model'),
        this.adbClient.shell(this.currentDevice.id, 'getprop ro.build.version.release'),
        this.adbClient.shell(this.currentDevice.id, 'getprop ro.build.version.sdk')
      ]);

      return {
        id: this.currentDevice.id,
        model: model.toString().trim(),
        androidVersion: androidVersion.toString().trim(),
        apiLevel: parseInt(apiLevel.toString().trim()),
        type: this.currentDevice.type
      };
    } catch (error) {
      this.log('warn', `Failed to get device info: ${error.message}`);
      return { id: this.currentDevice.id };
    }
  }

  /**
   * Wait for app to be in specific state
   */
  async waitForAppState(expectedState, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const isRunning = await this.isAppRunning();

      if ((expectedState === 'running' && isRunning) ||
          (expectedState === 'stopped' && !isRunning)) {
        return true;
      }

      await this.sleep(1000);
    }

    throw new Error(`App did not reach expected state '${expectedState}' within ${timeout}ms`);
  }

  /**
   * Simulate app lifecycle events
   */
  async simulateAppBackground() {
    this.log('info', 'Simulating app going to background');
    await this.pressKey('KEYCODE_HOME');
    await this.sleep(1000);
  }

  async simulateAppForeground() {
    this.log('info', 'Bringing app to foreground');
    await this.launchApp();
  }

  /**
   * Test network connectivity from device
   */
  async testNetworkConnectivity(host = 'google.com') {
    this.log('info', `Testing network connectivity to ${host}`);

    try {
      const output = await this.adbClient.shell(this.currentDevice.id,
        `ping -c 3 ${host}`);

      const result = output.toString();
      const success = result.includes('3 packets transmitted, 3 received');

      this.log('info', `Network connectivity: ${success ? 'OK' : 'FAILED'}`);
      return success;
    } catch (error) {
      this.log('failed', `Network connectivity test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get WiFi information
   */
  async getWiFiInfo() {
    try {
      const output = await this.adbClient.shell(this.currentDevice.id,
        'dumpsys wifi | grep "mWifiInfo"');

      return output.toString().trim();
    } catch (error) {
      this.log('warn', `Failed to get WiFi info: ${error.message}`);
      return '';
    }
  }

  /**
   * Clean up Android testing resources
   */
  async cleanup() {
    this.log('cleanup', 'Cleaning up Android testing resources');

    try {
      if (this.currentDevice) {
        await this.stopApp();
        await this.clearLogs();
      }

      if (this.adbClient) {
        this.adbClient.end();
      }
    } catch (error) {
      this.log('warn', `Cleanup error: ${error.message}`);
    }

    await super.cleanup();
  }
}

module.exports = AndroidTestUtils;