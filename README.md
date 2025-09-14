# Remote Terminal Sync

A pure terminal sync system between Android apps and Windows host terminals with perfect fidelity. Commands execute on the Windows host using ConPTY while Android provides a clean terminal interface with full keyboard, voice, and navigation support.

## Architecture

- **Android Client**: Kotlin + Jetpack Compose terminal UI with full IME and voice typing support
- **Windows Host Service**: .NET 8 C# Windows service using ConPTY for true terminal emulation
- **Optional Relay Server**: Go-based WebSocket relay for remote access without port forwarding

## Key Features

- Perfect terminal fidelity including arrow keys, history navigation, and control sequences
- TLS-encrypted WebSocket transport with certificate pinning
- LAN discovery for local connections
- Voice typing and standard Android keyboard support
- Hardware keyboard support with key repeat
- Bracketed paste support
- PowerShell and CMD support via ConPTY

## Quick Start

### 1. Generate Development Certificates
```bash
./scripts/generate-self-signed-certs.sh
```

### 2. Start Development Environment
```powershell
./scripts/dev-run-all.ps1
```

### 3. Build Android Client
```bash
cd android-client
./gradlew :app:installDebug
```

## Project Structure

```
remote-terminal-sync/
├── android-client/          # Kotlin + Compose Android app
├── host-windows/            # .NET 8 C# Windows service
├── relay/                   # Go WebSocket relay server
├── scripts/                 # Development and setup scripts
├── README.md               # This file
└── LICENSE                 # MIT License
```

## Protocol Overview

UTF-8 JSON lines over WebSocket with these message types:

- `auth` - Device authentication with host
- `stdin_input` - Text input and VT sequences
- `stdout_chunk` - Terminal output chunks
- `resize` - Terminal size changes
- `signal` - Control signals (Ctrl+C, etc.)
- `ping`/`pong` - Connection keepalive

## Security

- End-to-end TLS encryption
- Certificate pinning on Android
- Per-device authentication keys
- No plaintext command storage on relay
- Memory-only connection metadata

## Development Setup

### Prerequisites

**Windows Host:**
- Windows 10 1903+ or Windows 11
- .NET 8 SDK
- Developer mode enabled
- Admin rights for service installation

**Android Client:**
- Android Studio Jellyfish or newer
- JDK 17
- Android SDK 34
- Android device with API 24+ (Android 7.0+)

**Relay Server:**
- Go 1.22+
- Linux/Windows/macOS

### Local Development

1. **Generate certificates:**
   ```bash
   ./scripts/generate-self-signed-certs.sh
   ```

2. **Start relay server:**
   ```bash
   cd relay
   go run ./cmd/relay-server -config ./config.yaml
   ```

3. **Start Windows host service:**
   ```powershell
   cd host-windows
   dotnet run --project src/HostService
   ```

4. **Install Android app:**
   ```bash
   cd android-client
   ./gradlew :app:installDebug
   ```

### Production Deployment

**Windows Service Installation:**
```powershell
cd host-windows
dotnet publish -c Release
sc create RTXHost binPath="C:\path\to\HostService.exe" start=auto
sc start RTXHost
```

**Relay Server:**
```bash
cd relay
go build -o relay-server ./cmd/relay-server
./relay-server -config ./config.yaml
```

## Configuration

All services use YAML configuration files. Copy `config.example.yaml` to `config.yaml` in each component directory and customize as needed.

### Host Configuration
```yaml
# host-windows/config.yaml
host_id: "your-unique-host-id"
host_token: "32-byte-hex-token"
port: 8443
default_shell: "powershell"
tls_cert_path: "./certs/host.crt"
tls_key_path: "./certs/host.key"
relay_url: "wss://relay.example.com:8443"
```

### Android Configuration
Built-in configuration through UI with persistent storage:
- Device key (auto-generated)
- Known hosts list
- Certificate pinning configuration

### Relay Configuration
```yaml
# relay/config.yaml
port: 8443
tls_cert_path: "./certs/relay.crt"
tls_key_path: "./certs/relay.key"
jwt_secret: "your-jwt-secret"
```

## Testing

### Unit Tests
```bash
# Android
cd android-client && ./gradlew test

# Windows Host
cd host-windows && dotnet test

# Relay
cd relay && go test ./...
```

### Integration Tests
```bash
# End-to-end terminal functionality
cd android-client && ./gradlew connectedAndroidTest
```

### Manual Testing Scenarios

1. **Local Connection**: Android connects to Windows host on same network
2. **Remote Connection**: Android connects through relay server
3. **Terminal Features**: History navigation, arrow keys, Ctrl+C, tab completion
4. **Voice Input**: Dictate commands, execute with Enter key
5. **Hardware Keyboard**: Full keyboard support with modifiers

## Troubleshooting

### Connection Issues
- Check firewall settings (Windows host needs port 8443 open)
- Verify certificate pinning matches generated certificates
- Ensure mDNS/Bonjour is working for LAN discovery

### Terminal Issues
- ConPTY requires Windows 10 1903+
- PSReadLine may need manual installation for full history support
- UTF-8 code page should be automatic but verify with `chcp`

### Performance Issues
- WebSocket compression is disabled by default for low latency
- Increase buffer sizes for high-throughput scenarios
- Monitor network quality for relay connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.