using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NetEscapades.Configuration.Yaml;
using Serilog;
using HostService.Transport;
using HostService.Security;
using HostService.Discovery;
using HostService.Terminal;

namespace HostService;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        // Set up Serilog for early logging
        Log.Logger = new LoggerConfiguration()
            .WriteTo.Console()
            .WriteTo.File("logs/rtx-host-.txt", rollingInterval: RollingInterval.Day)
            .CreateLogger();

        try
        {
            Log.Information("Starting RTX Host Service");

            var host = CreateHostBuilder(args).Build();
            await host.RunAsync();

            Log.Information("RTX Host Service stopped cleanly");
            return 0;
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "RTX Host Service terminated unexpectedly");
            return 1;
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    public static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .UseWindowsService(options =>
            {
                options.ServiceName = "RTX Host Service";
            })
            .UseSerilog((context, loggerConfig) =>
            {
                var config = context.Configuration;
                var logLevel = config["LogLevel"] ?? "Information";

                loggerConfig
                    .WriteTo.Console()
                    .WriteTo.File("logs/rtx-host-.txt", rollingInterval: RollingInterval.Day)
                    .MinimumLevel.Is(Enum.Parse<Serilog.Events.LogEventLevel>(logLevel));
            })
            .ConfigureAppConfiguration((context, configBuilder) =>
            {
                configBuilder
                    .SetBasePath(Directory.GetCurrentDirectory())
                    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
                    .AddYamlFile("config.yaml", optional: true, reloadOnChange: true)
                    .AddEnvironmentVariables("RTX_")
                    .AddCommandLine(args);
            })
            .ConfigureServices((context, services) =>
            {
                var configuration = context.Configuration;

                // Bind configuration
                var hostConfig = new HostConfiguration();
                configuration.Bind(hostConfig);
                services.AddSingleton(hostConfig);

                var discoveryConfig = new DiscoveryConfiguration
                {
                    Enabled = hostConfig.Discovery.Enabled,
                    ServiceName = hostConfig.Discovery.ServiceName,
                    HostId = hostConfig.HostId,
                    FriendlyName = hostConfig.Discovery.FriendlyName,
                    Port = hostConfig.Port,
                    DefaultShell = hostConfig.DefaultShell
                };
                services.AddSingleton(discoveryConfig);

                // Register services
                services.AddSingleton<DeviceRegistry>();
                services.AddSingleton<TerminalDiscovery>();
                services.AddSingleton<WebSocketHost>();
                services.AddSingleton<LanDiscovery>();

                // Add hosted service
                services.AddHostedService<HostService>();
            });
}

public class HostService : BackgroundService
{
    private readonly ILogger<HostService> _logger;
    private readonly HostConfiguration _config;
    private readonly WebSocketHost _webSocketHost;
    private readonly LanDiscovery _lanDiscovery;

    public HostService(
        ILogger<HostService> logger,
        HostConfiguration config,
        WebSocketHost webSocketHost,
        LanDiscovery lanDiscovery)
    {
        _logger = logger;
        _config = config;
        _webSocketHost = webSocketHost;
        _lanDiscovery = lanDiscovery;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("RTX Host Service starting...");
        _logger.LogInformation("Host ID: {HostId}", _config.HostId);
        _logger.LogInformation("Port: {Port}", _config.Port);
        _logger.LogInformation("Default Shell: {Shell}", _config.DefaultShell);

        try
        {
            // Validate configuration
            if (string.IsNullOrEmpty(_config.HostId))
            {
                throw new InvalidOperationException("Host ID is required. Check your configuration file.");
            }

            if (string.IsNullOrEmpty(_config.HostToken))
            {
                throw new InvalidOperationException("Host token is required. Check your configuration file.");
            }

            // Start LAN discovery
            await _lanDiscovery.StartAsync(stoppingToken);

            // Start WebSocket server
            await _webSocketHost.StartAsync(stoppingToken);

            _logger.LogInformation("RTX Host Service started successfully");

            // Wait for cancellation
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("RTX Host Service is stopping");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RTX Host Service encountered an error");
            throw;
        }
        finally
        {
            try
            {
                await _webSocketHost.StopAsync();
                await _lanDiscovery.StopAsync();
                _logger.LogInformation("RTX Host Service stopped");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during service shutdown");
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("RTX Host Service stop requested");
        await base.StopAsync(cancellationToken);
    }
}