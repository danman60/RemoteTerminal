using System.Text;
using HostService.ConPty;
using Xunit;
using Xunit.Abstractions;

namespace HostService.Tests;

public class ConPtyTests : IDisposable
{
    private readonly ITestOutputHelper _output;
    private readonly List<ConPtySession> _sessions = new();

    public ConPtyTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact(Skip = "Requires Windows 10 1903+ and Admin privileges")]
    public void ConPtySession_CreateWithPowerShell_ShouldSucceed()
    {
        // Arrange & Act
        var session = ConPtySession.Create("powershell.exe -NoLogo -NoExit", 80, 24);
        _sessions.Add(session);

        // Assert
        Assert.NotNull(session);
    }

    [Fact(Skip = "Requires Windows 10 1903+ and Admin privileges")]
    public void ConPtySession_CreateWithCmd_ShouldSucceed()
    {
        // Arrange & Act
        var session = ConPtySession.Create("cmd.exe", 80, 24);
        _sessions.Add(session);

        // Assert
        Assert.NotNull(session);
    }

    [Fact(Skip = "Integration test - requires ConPTY")]
    public async Task ConPtySession_WriteInput_ShouldReceiveOutput()
    {
        // Arrange
        var session = ConPtySession.Create("cmd.exe", 80, 24);
        _sessions.Add(session);

        var outputReceived = false;
        var outputData = new List<byte[]>();

        session.DataReceived += (data) =>
        {
            outputReceived = true;
            outputData.Add(data);
            _output.WriteLine($"Received: {Encoding.UTF8.GetString(data)}");
        };

        // Act
        session.WriteInput("echo Hello World\r\n");

        // Wait for output
        await Task.Delay(2000);

        // Assert
        Assert.True(outputReceived, "Should have received output from ConPTY");
        Assert.NotEmpty(outputData);

        var allOutput = Encoding.UTF8.GetString(outputData.SelectMany(d => d).ToArray());
        Assert.Contains("Hello World", allOutput);
    }

    [Fact(Skip = "Integration test - requires ConPTY")]
    public async Task ConPtySession_Resize_ShouldNotThrow()
    {
        // Arrange
        var session = ConPtySession.Create("cmd.exe", 80, 24);
        _sessions.Add(session);

        // Act & Assert (should not throw)
        session.Resize(120, 30);

        // Give it time to process
        await Task.Delay(100);
    }

    [Fact(Skip = "Integration test - requires ConPTY")]
    public async Task ConPtySession_SendCtrlC_ShouldNotThrow()
    {
        // Arrange
        var session = ConPtySession.Create("cmd.exe", 80, 24);
        _sessions.Add(session);

        // Start a long-running command
        session.WriteInput("ping -t 127.0.0.1\r\n");
        await Task.Delay(1000);

        // Act & Assert (should not throw)
        session.SendSignal("INT");

        // Give it time to process
        await Task.Delay(100);
    }

    [Fact]
    public void ConPtySession_Dispose_ShouldNotThrow()
    {
        // This test can run without ConPTY by expecting the exception during creation
        // but testing that Dispose handles it gracefully

        ConPtySession? session = null;

        try
        {
            session = ConPtySession.Create("cmd.exe", 80, 24);
        }
        catch (InvalidOperationException)
        {
            // Expected on systems without ConPTY support
            _output.WriteLine("ConPTY not available - testing dispose safety");
        }

        // Act & Assert (should not throw regardless of whether session was created)
        session?.Dispose();
    }

    [Theory]
    [InlineData("powershell.exe -NoLogo -NoExit", 80, 24)]
    [InlineData("cmd.exe", 120, 30)]
    [InlineData("powershell.exe", 100, 50)]
    public void ConPtySession_CreateWithVariousSizes_ShouldHandleGracefully(string command, int cols, int rows)
    {
        // This test expects ConPTY creation to either succeed or fail gracefully

        try
        {
            var session = ConPtySession.Create(command, cols, rows);
            _sessions.Add(session);

            Assert.NotNull(session);
            _output.WriteLine($"Successfully created ConPTY session: {command} ({cols}x{rows})");
        }
        catch (InvalidOperationException ex)
        {
            // Expected on systems without ConPTY support
            _output.WriteLine($"ConPTY not available: {ex.Message}");
            Assert.Contains("Failed to create", ex.Message);
        }
    }

    [Fact]
    public void ConPtySession_WriteInputAfterDispose_ShouldNotThrow()
    {
        ConPtySession? session = null;

        try
        {
            session = ConPtySession.Create("cmd.exe", 80, 24);
            session.Dispose();

            // Act - should not throw even after dispose
            session.WriteInput("test\r\n");
            session.WriteInput(Encoding.UTF8.GetBytes("test\r\n"));
            session.Resize(100, 40);
            session.SendSignal("INT");
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Failed to create"))
        {
            // Expected on systems without ConPTY support
            _output.WriteLine($"ConPTY not available: {ex.Message}");
        }

        // Test should complete without throwing
        Assert.True(true, "Operations after dispose completed without throwing");
    }

    public void Dispose()
    {
        foreach (var session in _sessions)
        {
            try
            {
                session?.Dispose();
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Error disposing session: {ex.Message}");
            }
        }
        _sessions.Clear();
    }
}