using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using HostService.Protocol;
using HostService.ConPty;
using HostService.Security;

namespace HostService.Transport;

public class WebSocketHost : IDisposable
{
    private readonly ILogger<WebSocketHost> _logger;
    private readonly DeviceRegistry _deviceRegistry;
    private readonly HostConfiguration _config;
    private HttpListener? _httpListener;
    private CancellationTokenSource _cancellationTokenSource = new();
    private bool _disposed;

    public WebSocketHost(ILogger<WebSocketHost> logger, DeviceRegistry deviceRegistry, HostConfiguration config)
    {
        _logger = logger;
        _deviceRegistry = deviceRegistry;
        _config = config;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add($"http://localhost:{_config.Port}/");
            _httpListener.Start();

            _logger.LogInformation("WebSocket server started on port {Port}", _config.Port);

            await AcceptConnectionsAsync(_cancellationTokenSource.Token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start WebSocket server");
            throw;
        }
    }

    public async Task StopAsync()
    {
        _cancellationTokenSource.Cancel();
        _httpListener?.Stop();
        _httpListener?.Close();
        _logger.LogInformation("WebSocket server stopped");
    }

    private async Task AcceptConnectionsAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _httpListener != null)
        {
            try
            {
                var context = await _httpListener.GetContextAsync();

                // Handle WebSocket upgrade in background
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await HandleWebSocketConnectionAsync(context, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error handling WebSocket connection");
                    }
                }, cancellationToken);
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error accepting WebSocket connections");
                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(1000, cancellationToken);
                }
            }
        }
    }

    private async Task HandleWebSocketConnectionAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        if (!context.Request.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            context.Response.Close();
            return;
        }

        WebSocket? webSocket = null;
        ConPtySession? conPtySession = null;

        try
        {
            var webSocketContext = await context.AcceptWebSocketAsync(null);
            webSocket = webSocketContext.WebSocket;

            _logger.LogInformation("WebSocket connection established from {RemoteEndpoint}",
                context.Request.RemoteEndPoint);

            // Wait for authentication
            var authResult = await HandleAuthenticationAsync(webSocket, cancellationToken);
            if (!authResult.Success)
            {
                await SendErrorAsync(webSocket, "AUTH_FAILED", authResult.ErrorMessage);
                return;
            }

            // Create ConPTY session
            var shell = GetShellCommand(_config.DefaultShell);
            conPtySession = ConPtySession.Create(shell, _config.Pty.InitialCols, _config.Pty.InitialRows);

            // Send auth success
            var authOk = new AuthOkMessage
            {
                Pty = new PtyInfo
                {
                    Cols = _config.Pty.InitialCols,
                    Rows = _config.Pty.InitialRows
                },
                Shell = _config.DefaultShell
            };
            await SendMessageAsync(webSocket, authOk);

            // Set up ConPTY event handlers
            conPtySession.DataReceived += async (data) =>
            {
                var message = new StdoutChunkMessage
                {
                    Data = Convert.ToBase64String(data)
                };
                await SendMessageAsync(webSocket, message);
            };

            conPtySession.ProcessExited += async () =>
            {
                _logger.LogInformation("Terminal process exited");
                try
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure,
                        "Terminal process exited", cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error closing WebSocket after process exit");
                }
            };

            // Handle WebSocket messages
            await HandleWebSocketMessagesAsync(webSocket, conPtySession, cancellationToken);
        }
        catch (WebSocketException ex)
        {
            _logger.LogWarning(ex, "WebSocket connection error");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error handling WebSocket connection");
        }
        finally
        {
            conPtySession?.Dispose();

            if (webSocket?.State == WebSocketState.Open)
            {
                try
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.InternalServerError,
                        "Server error", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error closing WebSocket connection");
                }
            }

            webSocket?.Dispose();
            _logger.LogInformation("WebSocket connection closed");
        }
    }

    private async Task<(bool Success, string ErrorMessage)> HandleAuthenticationAsync(
        WebSocket webSocket, CancellationToken cancellationToken)
    {
        try
        {
            var buffer = new byte[4096];
            var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

            if (result.MessageType != WebSocketMessageType.Text)
            {
                return (false, "Expected text message for authentication");
            }

            var messageJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
            var message = JsonSerializer.Deserialize<AuthMessage>(messageJson);

            if (message == null || string.IsNullOrEmpty(message.DeviceKey))
            {
                return (false, "Invalid authentication message");
            }

            if (!_deviceRegistry.IsDeviceAuthorized(message.DeviceKey))
            {
                // Auto-register new devices in development mode
                if (_config.AutoRegisterDevices)
                {
                    _deviceRegistry.RegisterDevice(message.DeviceKey, "Auto-registered device");
                    _logger.LogInformation("Auto-registered device with key {DeviceKeyPrefix}...",
                        message.DeviceKey[..8]);
                }
                else
                {
                    return (false, "Device not authorized");
                }
            }
            else
            {
                _deviceRegistry.UpdateLastSeen(message.DeviceKey);
            }

            _logger.LogInformation("Device authenticated successfully");
            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during authentication");
            return (false, "Authentication error");
        }
    }

    private async Task HandleWebSocketMessagesAsync(WebSocket webSocket, ConPtySession conPtySession,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[_config.Pty.BufferSize];

        while (webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            try
            {
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                if (result.MessageType != WebSocketMessageType.Text)
                {
                    continue;
                }

                var messageJson = Encoding.UTF8.GetString(buffer, 0, result.Count);
                await ProcessIncomingMessageAsync(messageJson, conPtySession, webSocket);
            }
            catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
            {
                _logger.LogInformation("WebSocket connection closed by client");
                break;
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing WebSocket message");
                break;
            }
        }
    }

    private async Task ProcessIncomingMessageAsync(string messageJson, ConPtySession conPtySession, WebSocket webSocket)
    {
        try
        {
            using var document = JsonDocument.Parse(messageJson);
            var typeProperty = document.RootElement.GetProperty("type").GetString();

            switch (typeProperty)
            {
                case "stdin_input":
                    var stdinMessage = JsonSerializer.Deserialize<StdinInputMessage>(messageJson);
                    if (stdinMessage != null)
                    {
                        var data = stdinMessage.Mode == "text"
                            ? Encoding.UTF8.GetBytes(stdinMessage.Data)
                            : Convert.FromBase64String(stdinMessage.Data);
                        conPtySession.WriteInput(data);
                    }
                    break;

                case "resize":
                    var resizeMessage = JsonSerializer.Deserialize<ResizeMessage>(messageJson);
                    if (resizeMessage != null)
                    {
                        conPtySession.Resize(resizeMessage.Cols, resizeMessage.Rows);
                    }
                    break;

                case "signal":
                    var signalMessage = JsonSerializer.Deserialize<SignalMessage>(messageJson);
                    if (signalMessage != null)
                    {
                        conPtySession.SendSignal(signalMessage.Name);
                    }
                    break;

                case "ping":
                    var pongMessage = new PongMessage();
                    await SendMessageAsync(webSocket, pongMessage);
                    break;

                default:
                    _logger.LogWarning("Unknown message type: {MessageType}", typeProperty);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message: {Message}", messageJson);
        }
    }

    private async Task SendMessageAsync<T>(WebSocket webSocket, T message) where T : BaseMessage
    {
        try
        {
            var json = JsonSerializer.Serialize(message);
            var buffer = Encoding.UTF8.GetBytes(json);
            await webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text,
                true, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending WebSocket message");
        }
    }

    private async Task SendErrorAsync(WebSocket webSocket, string code, string message)
    {
        try
        {
            var errorMessage = new ErrorMessage
            {
                Code = code,
                Message = message
            };
            await SendMessageAsync(webSocket, errorMessage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending error message");
        }
    }

    private static string GetShellCommand(string shell)
    {
        return shell.ToLowerInvariant() switch
        {
            "powershell" or "pwsh" => "powershell.exe -NoLogo -NoExit",
            "cmd" => "cmd.exe",
            "bash" => "bash.exe",
            _ => "powershell.exe -NoLogo -NoExit"
        };
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _cancellationTokenSource?.Cancel();
        _httpListener?.Stop();
        _httpListener?.Close();
        _cancellationTokenSource?.Dispose();
    }
}

public class HostConfiguration
{
    public string HostId { get; set; } = string.Empty;
    public string HostToken { get; set; } = string.Empty;
    public int Port { get; set; } = 8443;
    public string DefaultShell { get; set; } = "powershell";
    public string TLSCertPath { get; set; } = string.Empty;
    public string TLSKeyPath { get; set; } = string.Empty;
    public string RelayUrl { get; set; } = string.Empty;
    public bool AutoRegisterDevices { get; set; } = true;

    public DiscoveryConfig Discovery { get; set; } = new();
    public PtyConfig Pty { get; set; } = new();

    public string LogLevel { get; set; } = "Information";
}

public class DiscoveryConfig
{
    public bool Enabled { get; set; } = true;
    public string ServiceName { get; set; } = "_rtx._tcp";
    public string FriendlyName { get; set; } = "RTX Host";
}

public class PtyConfig
{
    public int InitialCols { get; set; } = 120;
    public int InitialRows { get; set; } = 30;
    public int BufferSize { get; set; } = 8192;
}