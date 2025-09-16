using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;
using HostService.Terminal;

namespace HostService.Terminal;

public class TerminalAttachment : IDisposable
{
    private readonly ILogger<TerminalAttachment> _logger;
    private readonly TerminalInfo _terminalInfo;
    private bool _attached = false;
    private bool _disposed = false;
    private Thread? _inputMonitorThread;
    private Thread? _outputMonitorThread;
    private CancellationTokenSource _cancellationTokenSource = new();

    // Console API imports
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadConsoleInput(IntPtr hConsoleInput, [Out] INPUT_RECORD[] lpBuffer, uint nLength, out uint lpNumberOfEventsRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteConsoleInput(IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer, uint nLength, out uint lpNumberOfEventsWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetConsoleScreenBufferInfo(IntPtr hConsoleOutput, out CONSOLE_SCREEN_BUFFER_INFO lpConsoleScreenBufferInfo);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadConsoleOutput(IntPtr hConsoleOutput, [Out] CHAR_INFO[] lpBuffer, COORD dwBufferSize, COORD dwBufferCoord, ref SMALL_RECT lpReadRegion);

    private const int STD_INPUT_HANDLE = -10;
    private const int STD_OUTPUT_HANDLE = -11;
    private const int STD_ERROR_HANDLE = -12;

    // Console structures
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT_RECORD
    {
        public ushort EventType;
        public KEY_EVENT_RECORD Event;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEY_EVENT_RECORD
    {
        public bool bKeyDown;
        public ushort wRepeatCount;
        public ushort wVirtualKeyCode;
        public ushort wVirtualScanCode;
        public char UnicodeChar;
        public uint dwControlKeyState;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct CONSOLE_SCREEN_BUFFER_INFO
    {
        public COORD dwSize;
        public COORD dwCursorPosition;
        public ushort wAttributes;
        public SMALL_RECT srWindow;
        public COORD dwMaximumWindowSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct COORD
    {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SMALL_RECT
    {
        public short Left;
        public short Top;
        public short Right;
        public short Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct CHAR_INFO
    {
        public char UnicodeChar;
        public ushort Attributes;
    }

    public event Action<byte[]>? DataReceived;
    public event Action? ProcessExited;

    public TerminalAttachment(TerminalInfo terminalInfo, ILogger<TerminalAttachment> logger)
    {
        _terminalInfo = terminalInfo;
        _logger = logger;
    }

    public bool AttachToTerminal()
    {
        try
        {
            _logger.LogInformation($"Attempting to attach to terminal: {_terminalInfo.ProcessName} (PID: {_terminalInfo.ProcessId})");

            // Free current console if attached
            FreeConsole();

            // Attach to the target process console
            if (!AttachConsole((uint)_terminalInfo.ProcessId))
            {
                var error = Marshal.GetLastWin32Error();
                _logger.LogWarning($"Failed to attach to console. Error: {error}");
                return false;
            }

            _attached = true;
            _logger.LogInformation("Successfully attached to terminal console");

            // Start monitoring threads
            StartMonitoring();

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error attaching to terminal");
            return false;
        }
    }

    private void StartMonitoring()
    {
        _outputMonitorThread = new Thread(MonitorOutput)
        {
            IsBackground = true,
            Name = "TerminalOutputMonitor"
        };
        _outputMonitorThread.Start();

        _logger.LogInformation("Started terminal monitoring");
    }

    private void MonitorOutput()
    {
        try
        {
            var hOutput = GetStdHandle(STD_OUTPUT_HANDLE);
            if (hOutput == IntPtr.Zero)
            {
                _logger.LogWarning("Could not get output handle");
                return;
            }

            var lastBuffer = new Dictionary<string, CHAR_INFO>();

            while (!_cancellationTokenSource.Token.IsCancellationRequested && _attached)
            {
                try
                {
                    // Get console screen buffer info
                    if (GetConsoleScreenBufferInfo(hOutput, out var bufferInfo))
                    {
                        var width = (short)(bufferInfo.srWindow.Right - bufferInfo.srWindow.Left + 1);
                        var height = (short)(bufferInfo.srWindow.Bottom - bufferInfo.srWindow.Top + 1);

                        var buffer = new CHAR_INFO[width * height];
                        var bufferSize = new COORD { X = (short)width, Y = (short)height };
                        var bufferCoord = new COORD { X = 0, Y = 0 };
                        var readRegion = new SMALL_RECT
                        {
                            Left = bufferInfo.srWindow.Left,
                            Top = bufferInfo.srWindow.Top,
                            Right = bufferInfo.srWindow.Right,
                            Bottom = bufferInfo.srWindow.Bottom
                        };

                        if (ReadConsoleOutput(hOutput, buffer, bufferSize, bufferCoord, ref readRegion))
                        {
                            // Convert buffer to text and detect changes
                            var currentText = BufferToText(buffer, width, height);
                            var currentKey = $"{bufferInfo.dwCursorPosition.X},{bufferInfo.dwCursorPosition.Y}";

                            // Check if content changed
                            if (!lastBuffer.ContainsKey(currentKey) || !BuffersEqual(lastBuffer.Values.ToArray(), buffer))
                            {
                                // Send the updated content
                                var data = Encoding.UTF8.GetBytes(currentText);
                                DataReceived?.Invoke(data);

                                // Update last buffer
                                lastBuffer.Clear();
                                lastBuffer[currentKey] = buffer[0]; // Store first char as key
                            }
                        }
                    }

                    Thread.Sleep(100); // Poll every 100ms
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error monitoring output");
                    Thread.Sleep(1000);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error in output monitoring");
        }
    }

    private string BufferToText(CHAR_INFO[] buffer, int width, int height)
    {
        var lines = new List<string>();

        for (int y = 0; y < height; y++)
        {
            var line = new StringBuilder();
            for (int x = 0; x < width; x++)
            {
                var index = y * width + x;
                if (index < buffer.Length)
                {
                    line.Append(buffer[index].UnicodeChar);
                }
            }
            lines.Add(line.ToString().TrimEnd());
        }

        return string.Join("\r\n", lines.Where(l => !string.IsNullOrWhiteSpace(l)));
    }

    private bool BuffersEqual(CHAR_INFO[] buffer1, CHAR_INFO[] buffer2)
    {
        if (buffer1.Length != buffer2.Length) return false;

        for (int i = 0; i < buffer1.Length; i++)
        {
            if (buffer1[i].UnicodeChar != buffer2[i].UnicodeChar ||
                buffer1[i].Attributes != buffer2[i].Attributes)
            {
                return false;
            }
        }

        return true;
    }

    public void WriteInput(byte[] data)
    {
        if (!_attached) return;

        try
        {
            var text = Encoding.UTF8.GetString(data);
            WriteInput(text);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error writing input");
        }
    }

    public void WriteInput(string input)
    {
        if (!_attached) return;

        try
        {
            var hInput = GetStdHandle(STD_INPUT_HANDLE);
            if (hInput == IntPtr.Zero) return;

            var records = new List<INPUT_RECORD>();

            foreach (char c in input)
            {
                // Key down event
                records.Add(new INPUT_RECORD
                {
                    EventType = 1, // KEY_EVENT
                    Event = new KEY_EVENT_RECORD
                    {
                        bKeyDown = true,
                        wRepeatCount = 1,
                        wVirtualKeyCode = 0,
                        wVirtualScanCode = 0,
                        UnicodeChar = c,
                        dwControlKeyState = 0
                    }
                });

                // Key up event
                records.Add(new INPUT_RECORD
                {
                    EventType = 1, // KEY_EVENT
                    Event = new KEY_EVENT_RECORD
                    {
                        bKeyDown = false,
                        wRepeatCount = 1,
                        wVirtualKeyCode = 0,
                        wVirtualScanCode = 0,
                        UnicodeChar = c,
                        dwControlKeyState = 0
                    }
                });
            }

            WriteConsoleInput(hInput, records.ToArray(), (uint)records.Count, out _);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error writing input to console");
        }
    }

    public void Resize(int cols, int rows)
    {
        // Console resizing via AttachConsole is limited
        // This would require more complex window manipulation
        _logger.LogInformation($"Resize requested: {cols}x{rows} (not implemented for attached consoles)");
    }

    public void SendSignal(string signal)
    {
        // Signal sending via AttachConsole is limited
        _logger.LogInformation($"Signal requested: {signal} (limited support for attached consoles)");
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _cancellationTokenSource?.Cancel();

        if (_attached)
        {
            FreeConsole();
            _attached = false;
        }

        _outputMonitorThread?.Join(1000);
        _cancellationTokenSource?.Dispose();

        _logger.LogInformation("Terminal attachment disposed");
    }
}