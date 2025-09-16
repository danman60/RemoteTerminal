using System.Diagnostics;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;

namespace HostService.Terminal;

public class TerminalInfo
{
    public int ProcessId { get; set; }
    public string ProcessName { get; set; } = string.Empty;
    public string WindowTitle { get; set; } = string.Empty;
    public IntPtr WindowHandle { get; set; }
    public string CommandLine { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
}

public class TerminalDiscovery
{
    private readonly ILogger<TerminalDiscovery> _logger;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public TerminalDiscovery(ILogger<TerminalDiscovery> logger)
    {
        _logger = logger;
    }

    public List<TerminalInfo> DiscoverTerminals()
    {
        var terminals = new List<TerminalInfo>();

        try
        {
            // Get all processes that could be terminals
            var terminalProcesses = GetTerminalProcesses();
            _logger.LogInformation($"Found {terminalProcesses.Count} potential terminal processes");

            // Get windows for these processes
            var windows = GetProcessWindows(terminalProcesses);
            _logger.LogInformation($"Found {windows.Count} terminal windows");

            terminals.AddRange(windows);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error discovering terminals");
        }

        return terminals;
    }

    private List<Process> GetTerminalProcesses()
    {
        var terminalProcesses = new List<Process>();
        var processNames = new[] {
            "WindowsTerminal",
            "cmd",
            "powershell",
            "pwsh",
            "bash",
            "wsl",
            "conhost",
            "Cursor", // Cursor Editor terminal
            "Code", // VS Code
            "claude" // Claude Code
        };

        foreach (var processName in processNames)
        {
            try
            {
                var processes = Process.GetProcessesByName(processName);
                terminalProcesses.AddRange(processes);
                _logger.LogInformation($"Found {processes.Length} {processName} processes");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Error getting processes for {processName}");
            }
        }

        return terminalProcesses;
    }

    private List<TerminalInfo> GetProcessWindows(List<Process> processes)
    {
        var terminals = new List<TerminalInfo>();
        var processDict = processes.ToDictionary(p => (uint)p.Id, p => p);

        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd))
                return true;

            GetWindowThreadProcessId(hWnd, out uint processId);

            if (processDict.TryGetValue(processId, out var process))
            {
                var windowTitle = GetWindowTitle(hWnd);

                // Filter out empty or system windows
                if (!string.IsNullOrWhiteSpace(windowTitle) &&
                    !windowTitle.Contains("Default IME") &&
                    !windowTitle.Contains("MSCTFIME UI"))
                {
                    var terminal = new TerminalInfo
                    {
                        ProcessId = (int)processId,
                        ProcessName = process.ProcessName,
                        WindowTitle = windowTitle,
                        WindowHandle = hWnd,
                        CommandLine = GetProcessCommandLine((int)processId),
                        StartTime = process.StartTime
                    };

                    terminals.Add(terminal);
                    _logger.LogInformation($"Found terminal: {terminal.ProcessName} (PID: {terminal.ProcessId}) - {terminal.WindowTitle}");
                }
            }

            return true;
        }, IntPtr.Zero);

        return terminals;
    }

    private string GetWindowTitle(IntPtr hWnd)
    {
        var length = GetWindowTextLength(hWnd);
        if (length == 0) return string.Empty;

        var builder = new StringBuilder(length + 1);
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    private string GetProcessCommandLine(int processId)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher($"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {processId}");
            using var objects = searcher.Get();
            return objects.Cast<ManagementBaseObject>().SingleOrDefault()?["CommandLine"]?.ToString() ?? string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, $"Could not get command line for process {processId}");
            return string.Empty;
        }
    }

    public TerminalInfo? FindClaudeCodeTerminal()
    {
        var terminals = DiscoverTerminals();

        // Look for Claude Code terminals first
        var claudeTerminal = terminals.FirstOrDefault(t =>
            t.ProcessName.ToLowerInvariant().Contains("claude") ||
            t.WindowTitle.ToLowerInvariant().Contains("claude") ||
            t.CommandLine.ToLowerInvariant().Contains("claude"));

        if (claudeTerminal != null)
        {
            _logger.LogInformation($"Found Claude Code terminal: {claudeTerminal.WindowTitle}");
            return claudeTerminal;
        }

        // Fallback to most recent terminal
        var recentTerminal = terminals
            .Where(t => !string.IsNullOrWhiteSpace(t.WindowTitle))
            .OrderByDescending(t => t.StartTime)
            .FirstOrDefault();

        if (recentTerminal != null)
        {
            _logger.LogInformation($"Using most recent terminal: {recentTerminal.WindowTitle}");
        }

        return recentTerminal;
    }
}