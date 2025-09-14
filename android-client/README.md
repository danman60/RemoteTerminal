# Remote Terminal Sync - Android Client

Modern Android terminal client built with Jetpack Compose. Provides full terminal emulation with keyboard, voice input, and hardware keyboard support for connecting to Windows hosts.

## Features

- **Material 3 Design**: Modern Android UI with dark/light theme support
- **Full Terminal Emulation**: VT/ANSI sequence support with perfect fidelity
- **Voice Input**: Speak commands using Android speech recognition
- **Hardware Keyboard**: Full support for external keyboards with key mapping
- **Navigation Keys**: On-screen arrow keys, Ctrl, Esc, and function keys
- **Certificate Pinning**: Secure TLS connections with SPKI certificate pinning
- **LAN Discovery**: Automatic discovery of hosts using mDNS/Bonjour
- **Connection Management**: Direct connections and relay server support

## Requirements

- **Android 7.0+ (API 24+)**
- **Internet permission** for network connections
- **Microphone permission** for voice input (optional)
- **Network state permissions** for connectivity detection

## Building

### Prerequisites

- **Android Studio Jellyfish (2023.3.1) or newer**
- **JDK 17**
- **Android SDK 34**
- **Kotlin 1.9.22+**

### Build Commands

```bash
# Debug build
./gradlew :app:assembleDebug

# Release build
./gradlew :app:assembleRelease

# Install on connected device
./gradlew :app:installDebug

# Run tests
./gradlew :app:test
./gradlew :app:connectedAndroidTest
```

### Development Setup

1. **Clone and open in Android Studio**
2. **Sync Gradle dependencies**
3. **Update certificate pins** in `CertPinning.kt` using values from `dev-config.txt`
4. **Configure device key** in secure storage
5. **Run on device or emulator**

## Configuration

### Certificate Pinning

Update the certificate pins in `CertPinning.kt` with values from the certificate generation:

```kotlin
private val PINNED_CERTIFICATES = mapOf(
    "ca" to "your-ca-spki-pin-here",
    "relay" to "your-relay-spki-pin-here",
    "host" to "your-host-spki-pin-here"
)
```

### Device Authentication

The app automatically generates and stores a device key on first run using `EncryptedSharedPreferences`. The key is used for host authentication.

### Connection Settings

Default connection settings can be configured:

```kotlin
// Direct host connection
val hostUrl = "wss://192.168.1.100:8443"

// Relay connection
val relayUrl = "wss://relay.example.com:8443"
```

## Usage

### Connecting to Hosts

1. **LAN Discovery**:
   - Tap "Discover Hosts" to scan local network
   - Select discovered host from list
   - Tap "Connect"

2. **Manual Connection**:
   - Enter host address: `wss://192.168.1.100:8443`
   - Tap "Connect"

3. **Relay Connection**:
   - Enter relay URL with host ID
   - App handles relay authentication automatically

### Terminal Interaction

**Text Input:**
- Type commands in input field
- Press Enter or tap Send button to execute
- Input field supports Android IME features

**Voice Input:**
- Tap microphone button
- Speak your command clearly
- Tap again to stop listening
- Review text before sending

**Navigation Keys:**
- Use on-screen arrow keys for command history
- Home/End keys for line navigation
- Ctrl+C to interrupt running commands
- Esc key for command-line editing

**Hardware Keyboard:**
- Full support for external keyboards
- All standard key combinations work
- Arrow keys navigate command history
- Function keys send proper VT sequences

## Architecture

### UI Layer
- **Jetpack Compose** for modern declarative UI
- **Material 3** design system with terminal theming
- **ViewModel** for state management and business logic
- **StateFlow** for reactive UI updates

### Network Layer
- **OkHttp WebSocket** for terminal connections
- **TLS 1.2+** with certificate pinning
- **Automatic reconnection** with exponential backoff
- **Connection pooling** for multiple sessions

### Protocol Layer
- **JSON message protocol** over WebSocket
- **Base64 encoding** for binary terminal data
- **VT/ANSI sequence mapping** for key events
- **Keepalive/heartbeat** for connection health

### Security Layer
- **Certificate pinning** prevents MITM attacks
- **EncryptedSharedPreferences** for credential storage
- **Per-device authentication** keys
- **No plaintext credential transmission**

## Key Components

### TerminalScreen
Main UI composable with:
- Connection status bar
- Scrollable terminal output
- Command input field
- Navigation key grid
- Voice input controls

### TerminalViewModel
Manages:
- WebSocket connection state
- Terminal output buffering
- Input text processing
- Key event handling
- Voice recognition

### RtxWebSocket
Handles:
- WebSocket lifecycle management
- Message serialization/deserialization
- TLS certificate pinning
- Connection retry logic
- Protocol message routing

### KeyMapper
Provides:
- VT/ANSI escape sequence mapping
- Hardware keyboard event translation
- Key combination handling
- Bracketed paste mode support

### LanDiscovery
Manages:
- mDNS service discovery
- Host information resolution
- Network change detection
- Service announcement parsing

## Protocol Messages

### Authentication
```json
{
  "type": "auth",
  "device_key": "64-char-hex-device-key",
  "host_id": "target-host-uuid",
  "client_version": "1.0.0"
}
```

### Command Input
```json
{
  "type": "stdin_input",
  "mode": "text",
  "data": "ls -la\r\n"
}
```

### Key Events
```json
{
  "type": "stdin_input",
  "mode": "vt",
  "data": "\u001b[A"
}
```

### Terminal Resize
```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

### Output Reception
```json
{
  "type": "stdout_chunk",
  "data": "base64-encoded-terminal-output"
}
```

## Testing

### Unit Tests
```bash
# Run unit tests
./gradlew :app:test

# Test key mapping functionality
./gradlew :app:test --tests "*KeyMapperTest*"

# Test protocol message handling
./gradlew :app:test --tests "*ProtocolTest*"
```

### UI Tests
```bash
# Run instrumented tests on device
./gradlew :app:connectedAndroidTest

# Test terminal UI interactions
./gradlew :app:connectedAndroidTest --tests "*TerminalUiTest*"

# Test voice input functionality
./gradlew :app:connectedAndroidTest --tests "*VoiceInputTest*"
```

### Manual Testing

1. **Connection Testing**:
   - Test LAN discovery with multiple hosts
   - Verify direct connection to host
   - Test relay connection functionality
   - Validate connection error handling

2. **Terminal Functionality**:
   - Run interactive commands (vim, nano)
   - Test command history navigation
   - Verify Ctrl+C signal handling
   - Test terminal resizing

3. **Input Methods**:
   - Test software keyboard input
   - Verify hardware keyboard mapping
   - Test voice recognition accuracy
   - Validate special key sequences

## Troubleshooting

### Connection Issues

**Certificate Pinning Failures**
```
SSLException: Certificate pin validation failed
```
- Verify certificate pins match server certificates
- Check certificate expiry dates
- Ensure SPKI pins are calculated correctly

**Network Discovery Problems**
```
No hosts found on network
```
- Check WiFi network connectivity
- Verify mDNS is enabled on network
- Ensure hosts are advertising _rtx._tcp service
- Check Android network permissions

**WebSocket Connection Errors**
```
Connection failed: Unable to resolve host
```
- Verify host address and port
- Check network firewall rules
- Test host connectivity with other tools
- Validate TLS certificate configuration

### Performance Issues

**Slow Terminal Response**
- Check network latency to host
- Verify WebSocket message processing
- Monitor terminal output buffer size
- Consider connection quality

**High Memory Usage**
- Limit terminal output buffer size
- Check for connection leaks
- Monitor Compose recomposition frequency
- Review bitmap/image handling

### Input Problems

**Missing Key Events**
- Verify key mapping in KeyMapper
- Check hardware keyboard compatibility
- Test VT sequence generation
- Validate input method handling

**Voice Recognition Errors**
- Check microphone permissions
- Verify speech recognition availability
- Test with different languages/accents
- Check network connectivity for cloud recognition

## Development

### Adding Features

1. **New Protocol Messages**:
   - Add message class to `Protocol.kt`
   - Update WebSocket message parsing
   - Handle in TerminalViewModel
   - Add tests for new functionality

2. **UI Enhancements**:
   - Create new Composable functions
   - Follow Material 3 design patterns
   - Add to existing screen layouts
   - Test on different screen sizes

3. **Connection Methods**:
   - Extend WebSocket implementation
   - Add authentication mechanisms
   - Update discovery protocols
   - Test security implications

### Code Style

- Follow Android Kotlin style guide
- Use Compose best practices
- Implement proper error handling
- Add comprehensive documentation

### Performance Considerations

- Minimize Compose recompositions
- Use LazyColumn for large terminal output
- Implement proper WebSocket buffering
- Cache frequently used data

## Security Notes

### Certificate Pinning
- Pins are hardcoded for security
- Update pins when certificates change
- Test pinning with multiple certificate chains
- Monitor certificate expiration

### Credential Storage
- Use EncryptedSharedPreferences only
- Never store credentials in plain text
- Implement proper key derivation
- Regular security audits recommended

### Network Security
- Enforce TLS 1.2 minimum
- Validate all server certificates
- Use secure random number generation
- Implement proper session management

## License

MIT License - see root LICENSE file for details.