using System.Text.Json.Serialization;

namespace HostService.Protocol;

public abstract class BaseMessage
{
    [JsonPropertyName("type")]
    public abstract string Type { get; }

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AuthMessage : BaseMessage
{
    public override string Type => "auth";

    [JsonPropertyName("device_key")]
    public string DeviceKey { get; set; } = string.Empty;

    [JsonPropertyName("host_id")]
    public string HostId { get; set; } = string.Empty;

    [JsonPropertyName("client_version")]
    public string ClientVersion { get; set; } = string.Empty;
}

public class AuthOkMessage : BaseMessage
{
    public override string Type => "auth_ok";

    [JsonPropertyName("pty")]
    public PtyInfo Pty { get; set; } = new();

    [JsonPropertyName("shell")]
    public string Shell { get; set; } = string.Empty;
}

public class PtyInfo
{
    [JsonPropertyName("cols")]
    public int Cols { get; set; }

    [JsonPropertyName("rows")]
    public int Rows { get; set; }
}

public class StdinInputMessage : BaseMessage
{
    public override string Type => "stdin_input";

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "text"; // "text" or "vt"

    [JsonPropertyName("data")]
    public string Data { get; set; } = string.Empty;
}

public class StdoutChunkMessage : BaseMessage
{
    public override string Type => "stdout_chunk";

    [JsonPropertyName("data")]
    public string Data { get; set; } = string.Empty;
}

public class ResizeMessage : BaseMessage
{
    public override string Type => "resize";

    [JsonPropertyName("cols")]
    public int Cols { get; set; }

    [JsonPropertyName("rows")]
    public int Rows { get; set; }
}

public class SignalMessage : BaseMessage
{
    public override string Type => "signal";

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public class PingMessage : BaseMessage
{
    public override string Type => "ping";
}

public class PongMessage : BaseMessage
{
    public override string Type => "pong";
}

public class ErrorMessage : BaseMessage
{
    public override string Type => "error";

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;
}

// Relay messages
public class HostRegisterMessage : BaseMessage
{
    public override string Type => "host_register";

    [JsonPropertyName("host_id")]
    public string HostId { get; set; } = string.Empty;

    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;
}

public class HostRegisteredMessage : BaseMessage
{
    public override string Type => "host_registered";

    [JsonPropertyName("host_id")]
    public string HostId { get; set; } = string.Empty;
}

public class ClientReadyMessage : BaseMessage
{
    public override string Type => "client_ready";

    [JsonPropertyName("host_id")]
    public string HostId { get; set; } = string.Empty;
}