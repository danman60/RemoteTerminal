using System.Net;
using Microsoft.Extensions.Logging;
using Zeroconf;

namespace HostService.Discovery;

public class LanDiscovery : IDisposable
{
    private readonly ILogger<LanDiscovery> _logger;
    private readonly DiscoveryConfiguration _config;
    private IZeroconfHost? _zeroconfHost;
    private bool _disposed;

    public LanDiscovery(ILogger<LanDiscovery> logger, DiscoveryConfiguration config)
    {
        _logger = logger;
        _config = config;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (!_config.Enabled)
        {
            _logger.LogInformation("LAN discovery is disabled");
            return;
        }

        try
        {
            var properties = new Dictionary<string, string>
            {
                ["host_id"] = _config.HostId,
                ["friendly_name"] = _config.FriendlyName,
                ["version"] = "1.0.0",
                ["platform"] = "windows",
                ["shell"] = _config.DefaultShell ?? "powershell"
            };

            _zeroconfHost = ZeroconfResolver.CreateHost(
                serviceName: _config.ServiceName,
                protocol: "tcp",
                domain: "local.",
                port: _config.Port,
                txt: properties);

            await _zeroconfHost.RegisterAsync();

            _logger.LogInformation("LAN discovery started - advertising {ServiceName} on port {Port}",
                _config.ServiceName, _config.Port);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start LAN discovery service");
            throw;
        }
    }

    public async Task StopAsync()
    {
        if (_zeroconfHost != null)
        {
            try
            {
                await _zeroconfHost.UnregisterAsync();
                _logger.LogInformation("LAN discovery service stopped");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping LAN discovery service");
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            _zeroconfHost?.UnregisterAsync().Wait(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error disposing LAN discovery service");
        }

        _zeroconfHost?.Dispose();
    }

    public static async Task<List<DiscoveredHost>> DiscoverHostsAsync(
        string serviceName = "_rtx._tcp",
        TimeSpan? scanTime = null,
        CancellationToken cancellationToken = default)
    {
        var hosts = new List<DiscoveredHost>();
        var timeout = scanTime ?? TimeSpan.FromSeconds(5);

        try
        {
            var results = await ZeroconfResolver.ResolveAsync(serviceName, timeout, cancellationToken: cancellationToken);

            foreach (var result in results)
            {
                var host = new DiscoveredHost
                {
                    ServiceName = result.DisplayName,
                    HostId = result.Services.Values.FirstOrDefault()?.Properties?.GetValueOrDefault("host_id") ?? string.Empty,
                    FriendlyName = result.Services.Values.FirstOrDefault()?.Properties?.GetValueOrDefault("friendly_name") ?? "Unknown Host",
                    Address = result.IPAddress,
                    Port = result.Services.Values.FirstOrDefault()?.Port ?? 0,
                    Platform = result.Services.Values.FirstOrDefault()?.Properties?.GetValueOrDefault("platform") ?? "unknown",
                    Shell = result.Services.Values.FirstOrDefault()?.Properties?.GetValueOrDefault("shell") ?? "unknown"
                };

                if (!string.IsNullOrEmpty(host.HostId))
                {
                    hosts.Add(host);
                }
            }
        }
        catch (Exception ex)
        {
            // Log error but don't throw - discovery failures shouldn't break the app
            Console.WriteLine($"Error during host discovery: {ex.Message}");
        }

        return hosts;
    }
}

public class DiscoveryConfiguration
{
    public bool Enabled { get; set; } = true;
    public string ServiceName { get; set; } = "_rtx._tcp";
    public string HostId { get; set; } = string.Empty;
    public string FriendlyName { get; set; } = "RTX Host";
    public int Port { get; set; } = 8443;
    public string? DefaultShell { get; set; } = "powershell";
}

public class DiscoveredHost
{
    public string ServiceName { get; set; } = string.Empty;
    public string HostId { get; set; } = string.Empty;
    public string FriendlyName { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Platform { get; set; } = string.Empty;
    public string Shell { get; set; } = string.Empty;
    public DateTime DiscoveredAt { get; set; } = DateTime.UtcNow;

    public string ConnectionUrl => $"wss://{Address}:{Port}";
}