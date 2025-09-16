using System.Net;
using Microsoft.Extensions.Logging;
using Zeroconf;

namespace HostService.Discovery;

public class LanDiscovery : IDisposable
{
    private readonly ILogger<LanDiscovery> _logger;
    private readonly DiscoveryConfiguration _config;
    private bool _disposed;

    public LanDiscovery(ILogger<LanDiscovery> logger, DiscoveryConfiguration config)
    {
        _logger = logger;
        _config = config;
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (!_config.Enabled)
        {
            _logger.LogInformation("LAN discovery is disabled");
            return Task.CompletedTask;
        }

        try
        {
            // For now, just log that we would start LAN discovery
            // The current Zeroconf API doesn't support the host registration as used
            _logger.LogInformation("LAN discovery configured for {ServiceName} on port {Port} (host registration disabled in current implementation)",
                _config.ServiceName, _config.Port);
            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start LAN discovery service");
            throw;
        }
    }

    public Task StopAsync()
    {
        try
        {
            _logger.LogInformation("LAN discovery service stopped");
            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error stopping LAN discovery service");
            return Task.CompletedTask;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            // Cleanup if needed
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error disposing LAN discovery service");
        }
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
                var service = result.Services.Values.FirstOrDefault();
                if (service != null)
                {
                    var properties = service.Properties.FirstOrDefault();
                    var host = new DiscoveredHost
                    {
                        ServiceName = result.DisplayName,
                        HostId = properties?.TryGetValue("host_id", out var hostId) == true ? hostId : string.Empty,
                        FriendlyName = properties?.TryGetValue("friendly_name", out var friendlyName) == true ? friendlyName : "Unknown Host",
                        Address = result.IPAddress,
                        Port = service.Port,
                        Platform = properties?.TryGetValue("platform", out var platform) == true ? platform : "unknown",
                        Shell = properties?.TryGetValue("shell", out var shell) == true ? shell : "unknown"
                    };

                    if (!string.IsNullOrEmpty(host.HostId))
                    {
                        hosts.Add(host);
                    }
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