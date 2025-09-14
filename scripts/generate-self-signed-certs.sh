#!/bin/bash
set -euo pipefail

# Generate self-signed certificates for development
# Creates CA, server certs for relay and host, prints SPKI pins for Android

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$ROOT_DIR/certs"

echo "🔐 Generating self-signed certificates for development..."

# Create certs directory
mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

# Generate CA private key (password protected for better security)
openssl genpkey -algorithm RSA -out ca.key -pkcs8 -aes256 -pass pass:devca123

# Generate CA certificate
openssl req -new -x509 -key ca.key -out ca.crt -days 365 -passin pass:devca123 \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX Dev CA/OU=Development/CN=RTX Development CA"

echo "✅ Generated CA certificate"

# Generate relay server private key
openssl genpkey -algorithm RSA -out relay.key -pkcs8

# Generate relay server certificate signing request
openssl req -new -key relay.key -out relay.csr \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX/OU=Relay/CN=localhost"

# Create relay server certificate extensions
cat > relay.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = relay.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign relay server certificate
openssl x509 -req -in relay.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out relay.crt -days 365 -extensions v3_req -extfile relay.ext -passin pass:devca123

echo "✅ Generated relay server certificate"

# Generate Windows host private key
openssl genpkey -algorithm RSA -out host.key -pkcs8

# Generate Windows host certificate signing request
openssl req -new -key host.key -out host.csr \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX/OU=Host/CN=rtx-host.local"

# Create host server certificate extensions (broad network support)
cat > host.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = rtx-host.local
DNS.2 = localhost
DNS.3 = *.local
IP.1 = 127.0.0.1
IP.2 = ::1
IP.3 = 192.168.1.1
IP.4 = 10.0.0.1
IP.5 = 172.16.0.1
EOF

# Sign host server certificate
openssl x509 -req -in host.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out host.crt -days 365 -extensions v3_req -extfile host.ext -passin pass:devca123

echo "✅ Generated Windows host certificate"

# Generate client certificate for testing
openssl genpkey -algorithm RSA -out client.key -pkcs8
openssl req -new -key client.key -out client.csr \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX/OU=Client/CN=rtx-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365 -passin pass:devca123

echo "✅ Generated client certificate for testing"

# Clean up CSRs and extensions
rm -f *.csr *.ext

# Generate tokens for development
DEVICE_KEY=$(openssl rand -hex 32)
HOST_TOKEN=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
HOST_ID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen 2>/dev/null || echo "$(openssl rand -hex 16 | sed 's/\(.{8}\)\(.{4}\)\(.{4}\)\(.{4}\)\(.{12}\)/\1-\2-\3-\4-\5/')")

# Calculate SPKI pins for Android certificate pinning
echo ""
echo "📱 Certificate pins for Android certificate pinning:"
echo "=========================================="
CA_PIN=$(openssl x509 -in ca.crt -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64)
RELAY_PIN=$(openssl x509 -in relay.crt -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64)
HOST_PIN=$(openssl x509 -in host.crt -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64)

echo "CA Certificate SPKI Pin: $CA_PIN"
echo "Relay Server SPKI Pin: $RELAY_PIN"
echo "Host Server SPKI Pin: $HOST_PIN"
echo ""

echo "🔑 Generated tokens for development:"
echo "=========================================="
echo "Host ID: $HOST_ID"
echo "Device Key: $DEVICE_KEY"
echo "Host Token: $HOST_TOKEN"
echo "JWT Secret: $JWT_SECRET"

# Create config examples with generated tokens
cat > "$ROOT_DIR/relay/config.example.yaml" << EOF
# Relay server configuration
port: 8443
tls_cert_path: "../certs/relay.crt"
tls_key_path: "../certs/relay.key"
jwt_secret: "$JWT_SECRET"
max_connections_per_host: 10
connection_timeout: 300
keepalive_interval: 30
log_level: "info"
EOF

cat > "$ROOT_DIR/host-windows/config.example.yaml" << EOF
# Windows host service configuration
host_id: "$HOST_ID"
host_token: "$HOST_TOKEN"
port: 8443
default_shell: "powershell"
tls_cert_path: "../certs/host.crt"
tls_key_path: "../certs/host.key"
relay_url: "wss://localhost:8443"
discovery:
  enabled: true
  service_name: "_rtx._tcp"
  friendly_name: "Development Host"
pty:
  initial_cols: 120
  initial_rows: 30
  buffer_size: 8192
log_level: "info"
EOF

# Create Android configuration reference
cat > "$ROOT_DIR/android-client/dev-config.txt" << EOF
Development Configuration for Android Client:
============================================

Host ID: $HOST_ID
Device Key (store in EncryptedSharedPreferences): $DEVICE_KEY

Certificate Pins (add to CertPinning.kt):
CA: $CA_PIN
Relay: $RELAY_PIN
Host: $HOST_PIN

Default Endpoints:
Relay: wss://localhost:8443
Host (direct): wss://[host-ip]:8443
EOF

echo ""
echo "✅ All certificates and configuration files generated!"
echo ""
echo "📁 Files created in $CERTS_DIR:"
ls -la "$CERTS_DIR" 2>/dev/null || echo "Certificate files created successfully"
echo ""
echo "📝 Configuration examples created:"
echo "  - relay/config.example.yaml"
echo "  - host-windows/config.example.yaml"
echo "  - android-client/dev-config.txt"
echo ""
echo "🚀 Next steps:"
echo "1. Copy config.example.yaml to config.yaml in each component"
echo "2. Update Android app with certificate pins from dev-config.txt"
echo "3. Run ./scripts/dev-run-all.ps1 to start development environment"