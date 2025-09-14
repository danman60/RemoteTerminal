# Remote Terminal Sync - Relay Server

WebSocket relay server for remote terminal connections. Enables Android clients to connect to Windows host terminals over the internet without port forwarding.

## Features

- **TLS WebSocket Server**: Secure encrypted connections
- **JWT Authentication**: Short-lived connect tokens
- **Connection Brokering**: Pairs Android clients with Windows hosts
- **Health Monitoring**: REST endpoints for status and metrics
- **Graceful Shutdown**: Clean connection termination

## Architecture

The relay server acts as a secure broker between Android clients and Windows hosts:

1. **Host Registration**: Windows hosts register with their host ID and token
2. **Client Connection**: Android clients connect using JWT tokens generated for specific host IDs
3. **Message Forwarding**: All terminal data passes through encrypted WebSocket tunnels
4. **Connection Management**: Automatic cleanup and health monitoring

## Configuration

Create `config.yaml` from `config.example.yaml`:

```yaml
# Relay server configuration
port: 8443
tls_cert_path: "../certs/relay.crt"
tls_key_path: "../certs/relay.key"
jwt_secret: "your-32-byte-hex-secret"
max_connections_per_host: 10
connection_timeout: 300
keepalive_interval: 30
log_level: "info"
```

### Configuration Options

- `port`: WebSocket server port (default: 8443)
- `tls_cert_path`: Path to TLS certificate file
- `tls_key_path`: Path to TLS private key file
- `jwt_secret`: Secret for JWT token signing (32+ bytes hex)
- `max_connections_per_host`: Maximum concurrent clients per host
- `connection_timeout`: Connection timeout in seconds
- `keepalive_interval`: WebSocket ping interval in seconds
- `log_level`: Logging level (debug, info, warn, error)

## Building

### Prerequisites

- Go 1.22+
- TLS certificates (see root README for generation)

### Build Commands

```bash
# Development build
go build -o relay-server ./cmd/relay-server

# Production build with optimizations
go build -ldflags="-w -s" -o relay-server ./cmd/relay-server

# Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o relay-server-linux ./cmd/relay-server
```

## Running

### Development

```bash
# Start with default config
./relay-server -config ./config.yaml

# Generate connect token for testing
./relay-server -gen-token "host-uuid-here:32-byte-hex-device-key"
```

### Production

```bash
# Run as systemd service (Linux)
sudo cp relay-server /usr/local/bin/
sudo cp config.yaml /etc/rtx-relay/
sudo systemctl enable rtx-relay
sudo systemctl start rtx-relay

# Run as Windows service
sc create RTXRelay binPath="C:\RTX\relay-server.exe -config C:\RTX\config.yaml"
sc start RTXRelay
```

## REST API

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Connection Stats

```bash
GET /stats
```

Response:
```json
{
  "stats": {
    "hosts": 5,
    "clients": 3,
    "pairs": 3
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Protocol

WebSocket messages are JSON-encoded with these types:

### Host Registration
```json
{
  "type": "host_register",
  "host_id": "uuid-of-host",
  "token": "host-authentication-token"
}
```

### Client Connection
```json
{
  "type": "client_connect",
  "host_id": "uuid-of-target-host",
  "token": "jwt-connect-token"
}
```

### Message Forwarding
All other message types are forwarded transparently between paired connections.

## Security

- **TLS 1.2+**: All connections encrypted with strong cipher suites
- **JWT Tokens**: Time-limited authentication (5-minute expiry)
- **Certificate Pinning**: Clients verify server certificate fingerprints
- **Memory-Only Storage**: No persistent connection data
- **Automatic Cleanup**: Orphaned connections are terminated

## Monitoring

### Logs

The relay server logs all connection events:

```
INFO[2024-01-15T10:30:00Z] Starting relay server addr=":8443"
INFO[2024-01-15T10:30:15Z] Host registered hostID="550e8400-e29b-41d4-a716-446655440000"
INFO[2024-01-15T10:30:20Z] Client connected clientID="client_1705317620123" hostID="550e8400-e29b-41d4-a716-446655440000"
WARN[2024-01-15T10:35:00Z] Host already has a client, disconnecting existing hostID="550e8400-e29b-41d4-a716-446655440000"
INFO[2024-01-15T10:40:10Z] Host disconnected hostID="550e8400-e29b-41d4-a716-446655440000"
```

### Health Monitoring

Use the `/health` endpoint for load balancer health checks and monitoring systems.

### Performance Metrics

The `/stats` endpoint provides real-time connection counts for capacity planning.

## Troubleshooting

### Common Issues

**TLS Certificate Errors**
- Verify certificate paths in config.yaml
- Check certificate validity: `openssl x509 -in cert.crt -text -noout`
- Ensure private key matches certificate

**JWT Token Errors**
- Verify JWT secret matches between relay and token generation
- Check token expiry (5-minute limit)
- Validate token format with JWT debuggers

**Connection Failures**
- Check firewall rules for port 8443
- Verify DNS resolution for relay server
- Monitor server logs for detailed error messages

**Memory Usage**
- Each connection uses ~4KB memory
- Monitor for connection leaks if memory grows continuously
- Check `/stats` endpoint for unexpected connection counts

### Debug Mode

Enable debug logging for detailed connection tracing:

```yaml
log_level: "debug"
```

This will log all WebSocket messages and connection state changes.

## Deployment

### Docker

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -ldflags="-w -s" -o relay-server ./cmd/relay-server

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/relay-server .
COPY config.yaml .
COPY certs/ certs/
EXPOSE 8443
CMD ["./relay-server", "-config", "./config.yaml"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rtx-relay
spec:
  replicas: 2
  selector:
    matchLabels:
      app: rtx-relay
  template:
    metadata:
      labels:
        app: rtx-relay
    spec:
      containers:
      - name: relay
        image: rtx-relay:latest
        ports:
        - containerPort: 8443
        volumeMounts:
        - name: config
          mountPath: /root/config.yaml
          subPath: config.yaml
        - name: certs
          mountPath: /root/certs
      volumes:
      - name: config
        configMap:
          name: rtx-relay-config
      - name: certs
        secret:
          secretName: rtx-relay-certs
```

## License

MIT License - see root LICENSE file for details.