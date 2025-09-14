# PowerShell script to run all services for development
param(
    [switch]$GenerateCerts = $false,
    [switch]$BuildAll = $false,
    [switch]$ShowOutput = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "🚀 Remote Terminal Sync Development Setup" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# Generate certificates if requested
if ($GenerateCerts) {
    Write-Host "🔐 Generating development certificates..." -ForegroundColor Yellow
    & bash "$ScriptDir/generate-self-signed-certs.sh"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Certificate generation failed"
        exit 1
    }
    Write-Host ""
}

# Check if certificates exist
$CertDir = "$RootDir/certs"
if (!(Test-Path "$CertDir/relay.crt") -or !(Test-Path "$CertDir/host.crt")) {
    Write-Host "❌ Certificates not found. Run with -GenerateCerts to create them." -ForegroundColor Red
    Write-Host "   ./scripts/dev-run-all.ps1 -GenerateCerts" -ForegroundColor Yellow
    exit 1
}

# Build all components if requested
if ($BuildAll) {
    Write-Host "🔧 Building all components..." -ForegroundColor Yellow

    Write-Host "  → Building relay server..." -ForegroundColor Cyan
    Push-Location "$RootDir/relay"
    New-Item -ItemType Directory -Force -Path "./bin" | Out-Null
    go build -o "./bin/relay-server.exe" "./cmd/relay-server"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Relay server build failed"
        Pop-Location
        exit 1
    }
    Pop-Location

    Write-Host "  → Building Windows host service..." -ForegroundColor Cyan
    Push-Location "$RootDir/host-windows"
    dotnet build --configuration Release
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Windows host service build failed"
        Pop-Location
        exit 1
    }
    Pop-Location

    Write-Host "  → Building Android app..." -ForegroundColor Cyan
    Push-Location "$RootDir/android-client"
    if (Test-Path "./gradlew") {
        ./gradlew assembleDebug
    } else {
        gradlew assembleDebug
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Android app build failed"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "✅ All components built successfully" -ForegroundColor Green
    Write-Host ""
}

# Check for existing config or use generated values
$ConfigExists = $false
if ((Test-Path "$RootDir/host-windows/config.yaml") -and (Test-Path "$RootDir/relay/config.yaml")) {
    $ConfigExists = $true
    Write-Host "📋 Using existing configuration files" -ForegroundColor Cyan
} else {
    Write-Host "📋 Creating new configuration files..." -ForegroundColor Yellow
}

# Generate host ID and keys if not using existing config
if (-not $ConfigExists) {
    $HostId = [System.Guid]::NewGuid().ToString()
    $DeviceKey = -join ((1..64) | ForEach {'{0:X}' -f (Get-Random -Max 16)})
    $HostToken = -join ((1..64) | ForEach {'{0:X}' -f (Get-Random -Max 16)})
    $JwtSecret = -join ((1..64) | ForEach {'{0:X}' -f (Get-Random -Max 16)})

    # Relay config
    $RelayConfig = @"
# Relay server configuration
port: 8443
tls_cert_path: "../certs/relay.crt"
tls_key_path: "../certs/relay.key"
jwt_secret: "$JwtSecret"
max_connections_per_host: 10
connection_timeout: 300
keepalive_interval: 30
log_level: "info"
"@

    Set-Content -Path "$RootDir/relay/config.yaml" -Value $RelayConfig

    # Host config
    $HostConfig = @"
# Windows host service configuration
host_id: "$HostId"
host_token: "$HostToken"
port: 8443
default_shell: "powershell"
tls_cert_path: "../certs/host.crt"
tls_key_path: "../certs/host.key"
relay_url: "wss://localhost:8443"
discovery:
  enabled: true
  service_name: "_rtx._tcp"
  friendly_name: "$env:COMPUTERNAME Development Host"
pty:
  initial_cols: 120
  initial_rows: 30
  buffer_size: 8192
log_level: "info"
"@

    Set-Content -Path "$RootDir/host-windows/config.yaml" -Value $HostConfig

    # Create Android dev config for reference
    $AndroidConfig = @"
Development Configuration for Android Client:
============================================

Host ID: $HostId
Device Key (store in EncryptedSharedPreferences): $DeviceKey

Default Endpoints:
Relay: wss://localhost:8443
Host (direct): wss://[host-ip]:8443
"@

    Set-Content -Path "$RootDir/android-client/dev-config-runtime.txt" -Value $AndroidConfig
}

# Read config for display
$DisplayHostId = "Unknown"
$DisplayDeviceKey = "Unknown"
if ($ConfigExists) {
    try {
        $HostConfigContent = Get-Content "$RootDir/host-windows/config.yaml" -Raw
        if ($HostConfigContent -match 'host_id:\s*"?([^"\r\n]*)"?') {
            $DisplayHostId = $Matches[1]
        }
        if (Test-Path "$RootDir/android-client/dev-config-runtime.txt") {
            $AndroidConfigContent = Get-Content "$RootDir/android-client/dev-config-runtime.txt" -Raw
            if ($AndroidConfigContent -match 'Device Key.*:\s*([^\r\n]*)') {
                $DisplayDeviceKey = $Matches[1]
            }
        }
    } catch {
        # Use defaults if config parsing fails
    }
} else {
    $DisplayHostId = $HostId
    $DisplayDeviceKey = $DeviceKey
}

Write-Host "📊 Development Information" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green
Write-Host "Host ID: " -NoNewline -ForegroundColor White
Write-Host $DisplayHostId -ForegroundColor Cyan
if (-not $ConfigExists) {
    Write-Host "Device Key: " -NoNewline -ForegroundColor White
    Write-Host $DisplayDeviceKey -ForegroundColor Cyan
}
Write-Host ""
Write-Host "🌐 Connection Endpoints:" -ForegroundColor White
Write-Host "  Relay Server:  wss://localhost:8443" -ForegroundColor Cyan
Write-Host "  Host Direct:   wss://localhost:8443" -ForegroundColor Cyan
Write-Host ""

# Ensure binary exists for relay
if (-not (Test-Path "$RootDir/relay/bin/relay-server.exe") -and -not (Test-Path "$RootDir/relay/relay-server.exe")) {
    Write-Host "⚠️  Relay server binary not found. Building..." -ForegroundColor Yellow
    Push-Location "$RootDir/relay"
    New-Item -ItemType Directory -Force -Path "./bin" | Out-Null
    go build -o "./bin/relay-server.exe" "./cmd/relay-server"
    Pop-Location
}

# Start services in background jobs
Write-Host "🚀 Starting services..." -ForegroundColor Green

$RelayBinary = if (Test-Path "$RootDir/relay/bin/relay-server.exe") {
    "./bin/relay-server.exe"
} else {
    "./relay-server.exe"
}

Write-Host "  → Starting relay server..." -ForegroundColor Cyan
$RelayJob = Start-Job -Name "RelayServer" -ScriptBlock {
    param($RootDir, $RelayBinary)
    Set-Location "$RootDir/relay"
    & $RelayBinary -config "./config.yaml"
} -ArgumentList $RootDir, $RelayBinary

Start-Sleep 2

Write-Host "  → Starting Windows host service..." -ForegroundColor Cyan
$HostJob = Start-Job -Name "HostService" -ScriptBlock {
    param($RootDir)
    Set-Location "$RootDir/host-windows"
    & "dotnet" "run" "--project" "src/HostService"
} -ArgumentList $RootDir

Write-Host ""
Write-Host "✅ Services Started" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green
Write-Host "Relay Server Job:  $($RelayJob.Id)" -ForegroundColor Yellow
Write-Host "Host Service Job:  $($HostJob.Id)" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 Commands:" -ForegroundColor White
Write-Host "  View output:    " -NoNewline -ForegroundColor White
Write-Host "Receive-Job $($RelayJob.Id)" -ForegroundColor Yellow
Write-Host "  View output:    " -NoNewline -ForegroundColor White
Write-Host "Receive-Job $($HostJob.Id)" -ForegroundColor Yellow
Write-Host "  Stop services:  " -NoNewline -ForegroundColor White
Write-Host "Ctrl+C" -ForegroundColor Yellow
Write-Host ""

if ($ShowOutput) {
    Write-Host "📺 Live output mode (press Ctrl+C to stop)" -ForegroundColor Cyan
    Write-Host ""
}

# Wait for user interrupt
try {
    $iteration = 0
    while ($true) {
        Start-Sleep 1
        $iteration++

        # Show periodic output if requested
        if ($ShowOutput -and ($iteration % 5 -eq 0)) {
            $RelayOutput = Receive-Job $RelayJob -Keep
            $HostOutput = Receive-Job $HostJob -Keep

            if ($RelayOutput) {
                Write-Host "--- Relay Output ---" -ForegroundColor Blue
                Write-Host $RelayOutput -ForegroundColor Gray
            }
            if ($HostOutput) {
                Write-Host "--- Host Output ---" -ForegroundColor Magenta
                Write-Host $HostOutput -ForegroundColor Gray
            }
        }

        # Check job status
        if ($RelayJob.State -eq "Failed") {
            Write-Host "❌ Relay server failed!" -ForegroundColor Red
            Receive-Job $RelayJob | Write-Host -ForegroundColor Red
            break
        }
        if ($HostJob.State -eq "Failed") {
            Write-Host "❌ Host service failed!" -ForegroundColor Red
            Receive-Job $HostJob | Write-Host -ForegroundColor Red
            break
        }
    }
} catch [System.Management.Automation.PipelineStoppedException] {
    # Ctrl+C was pressed
} finally {
    Write-Host ""
    Write-Host "🛑 Stopping services..." -ForegroundColor Yellow
    Stop-Job $RelayJob -ErrorAction SilentlyContinue
    Stop-Job $HostJob -ErrorAction SilentlyContinue

    # Wait a moment for graceful shutdown
    Start-Sleep 2

    Remove-Job $RelayJob -Force -ErrorAction SilentlyContinue
    Remove-Job $HostJob -Force -ErrorAction SilentlyContinue
    Write-Host "✅ All services stopped." -ForegroundColor Green
}