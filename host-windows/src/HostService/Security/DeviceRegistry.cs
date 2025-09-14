using System.Text.Json;
using System.Security.Cryptography;

namespace HostService.Security;

public class DeviceInfo
{
    public string DeviceKey { get; set; } = string.Empty;
    public string FriendlyName { get; set; } = string.Empty;
    public DateTime FirstSeen { get; set; }
    public DateTime LastSeen { get; set; }
    public bool IsRevoked { get; set; }
}

public class DeviceRegistry
{
    private readonly string _registryPath;
    private readonly Dictionary<string, DeviceInfo> _devices = new();
    private readonly object _lock = new();

    public DeviceRegistry(string registryPath = "DeviceRegistry.json")
    {
        _registryPath = registryPath;
        LoadRegistry();
    }

    public bool IsDeviceAuthorized(string deviceKey)
    {
        lock (_lock)
        {
            return _devices.TryGetValue(deviceKey, out var device) && !device.IsRevoked;
        }
    }

    public void RegisterDevice(string deviceKey, string friendlyName = "Unknown Device")
    {
        lock (_lock)
        {
            if (_devices.TryGetValue(deviceKey, out var existingDevice))
            {
                existingDevice.LastSeen = DateTime.UtcNow;
                if (!string.IsNullOrEmpty(friendlyName) && friendlyName != "Unknown Device")
                {
                    existingDevice.FriendlyName = friendlyName;
                }
            }
            else
            {
                _devices[deviceKey] = new DeviceInfo
                {
                    DeviceKey = deviceKey,
                    FriendlyName = friendlyName,
                    FirstSeen = DateTime.UtcNow,
                    LastSeen = DateTime.UtcNow,
                    IsRevoked = false
                };
            }

            SaveRegistry();
        }
    }

    public void RevokeDevice(string deviceKey)
    {
        lock (_lock)
        {
            if (_devices.TryGetValue(deviceKey, out var device))
            {
                device.IsRevoked = true;
                SaveRegistry();
            }
        }
    }

    public IEnumerable<DeviceInfo> GetAllDevices()
    {
        lock (_lock)
        {
            return _devices.Values.ToList();
        }
    }

    public void UpdateLastSeen(string deviceKey)
    {
        lock (_lock)
        {
            if (_devices.TryGetValue(deviceKey, out var device))
            {
                device.LastSeen = DateTime.UtcNow;
                // Don't save on every update to avoid too much I/O
            }
        }
    }

    private void LoadRegistry()
    {
        try
        {
            if (File.Exists(_registryPath))
            {
                var json = File.ReadAllText(_registryPath);
                var devices = JsonSerializer.Deserialize<Dictionary<string, DeviceInfo>>(json);

                if (devices != null)
                {
                    foreach (var kvp in devices)
                    {
                        _devices[kvp.Key] = kvp.Value;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Failed to load device registry: {ex.Message}");
        }
    }

    private void SaveRegistry()
    {
        try
        {
            var options = new JsonSerializerOptions
            {
                WriteIndented = true
            };

            var json = JsonSerializer.Serialize(_devices, options);
            File.WriteAllText(_registryPath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: Failed to save device registry: {ex.Message}");
        }
    }

    public static string GenerateDeviceKey()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[32];
        rng.GetBytes(bytes);
        return Convert.ToHexString(bytes);
    }

    public static string GenerateHostToken()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[32];
        rng.GetBytes(bytes);
        return Convert.ToHexString(bytes);
    }
}