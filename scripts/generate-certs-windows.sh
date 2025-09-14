#!/bin/bash
set -e

# Generate self-signed certificates for development (Windows compatible)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$ROOT_DIR/certs"

echo "🔐 Generating self-signed certificates for development..."

# Create certs directory
mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

# Generate CA private key (Windows OpenSSL 3.x compatible)
openssl genpkey -algorithm RSA -out ca.key

# Generate CA certificate
openssl req -new -x509 -key ca.key -out ca.crt -days 365 \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX Dev CA/OU=Development/CN=RTX Development CA"

echo "✅ Generated CA certificate"

# Generate relay server private key
openssl genpkey -algorithm RSA -out relay.key

# Generate relay server certificate signing request
openssl req -new -key relay.key -out relay.csr \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX/OU=Relay/CN=localhost"

# Create relay server certificate extensions
cat > relay.ext << 'EOF'
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
  -out relay.crt -days 365 -extensions v3_req -extfile relay.ext

echo "✅ Generated relay server certificate"

# Generate Windows host private key
openssl genpkey -algorithm RSA -out host.key

# Generate Windows host certificate signing request
openssl req -new -key host.key -out host.csr \
  -subj "/C=US/ST=Dev/L=Dev/O=RTX/OU=Host/CN=rtx-host.local"

# Create host server certificate extensions
cat > host.ext << 'EOF'
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
  -out host.crt -days 365 -extensions v3_req -extfile host.ext

echo "✅ Generated Windows host certificate"

# Clean up CSRs and extensions
rm -f *.csr *.ext

# Generate tokens for development
DEVICE_KEY=$(openssl rand -hex 32)
HOST_TOKEN=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

# Try different ways to generate UUID
if command -v python3 >/dev/null 2>&1; then
    HOST_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
elif command -v uuidgen >/dev/null 2>&1; then
    HOST_ID=$(uuidgen)
else
    # Fallback: generate a UUID-like string
    HOST_ID=$(openssl rand -hex 16 | sed 's/\(.{8}\)\(.{4}\)\(.{4}\)\(.{4}\)\(.{12}\)/\1-\2-\3-\4-\5/')
fi

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
cat > "$ROOT_DIR/relay/config.yaml" << EOF
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

cat > "$ROOT_DIR/host-windows/config.yaml" << EOF
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
auto_register_devices: true
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

How to update Android app:
1. Edit android-client/app/src/main/java/com/rtx/app/security/CertPinning.kt
2. Replace the pins in PINNED_CERTIFICATES map:
   "ca" to "$CA_PIN",
   "relay" to "$RELAY_PIN",
   "host" to "$HOST_PIN"
3. Rebuild the Android app
EOF

echo ""
echo "✅ All certificates and configuration files generated!"
echo ""
echo "📁 Files created in $CERTS_DIR:"
ls -la "$CERTS_DIR" 2>/dev/null || echo "Certificate files created successfully"
echo ""
echo "📝 Configuration files created:"
echo "  - relay/config.yaml"
echo "  - host-windows/config.yaml"
echo "  - android-client/dev-config.txt"
echo ""
echo "🚀 Next steps:"
echo "1. Update Android certificate pins using android-client/dev-config.txt"
echo "2. Run: ./scripts/dev-run-all.ps1 to start services"
echo "3. Build Android app: cd android-client && ./gradlew :app:assembleDebug"