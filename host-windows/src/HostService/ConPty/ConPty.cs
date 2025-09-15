using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using static HostService.ConPty.NativeMethods;

namespace HostService.ConPty;

public class ConPtySession : IDisposable
{
    private readonly SafeFileHandle _inputPipeWrite;
    private readonly SafeFileHandle _outputPipeRead;
    private readonly IntPtr _pseudoConsoleHandle;
    private readonly IntPtr _processHandle;
    private readonly IntPtr _threadHandle;
    private readonly uint _processId;
    private bool _disposed;

    public event Action<byte[]>? DataReceived;
    public event Action? ProcessExited;

    public static ConPtySession Create(string command, int cols = 120, int rows = 30)
    {
        // Create pipes for pseudo console
        var securityAttributes = new SECURITY_ATTRIBUTES
        {
            nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
            bInheritHandle = 1
        };

        if (!CreatePipe(out var inputPipeRead, out var inputPipeWrite, ref securityAttributes, 0))
            throw new InvalidOperationException($"Failed to create input pipe: {Marshal.GetLastWin32Error()}");

        if (!CreatePipe(out var outputPipeRead, out var outputPipeWrite, ref securityAttributes, 0))
        {
            inputPipeRead.Dispose();
            inputPipeWrite.Dispose();
            throw new InvalidOperationException($"Failed to create output pipe: {Marshal.GetLastWin32Error()}");
        }

        // Create pseudo console
        var coordSize = new COORD((short)cols, (short)rows);
        var result = CreatePseudoConsole(coordSize, inputPipeRead, outputPipeWrite, 0, out var pseudoConsoleHandle);

        // Close the pipe ends we don't need
        inputPipeRead.Dispose();
        outputPipeWrite.Dispose();

        if (result != S_OK)
        {
            inputPipeWrite.Dispose();
            outputPipeRead.Dispose();
            throw new InvalidOperationException($"Failed to create pseudo console: {result}");
        }

        // Setup process creation
        var processInfo = new PROCESS_INFORMATION();
        var startupInfoEx = new STARTUPINFOEX();
        startupInfoEx.StartupInfo.cb = Marshal.SizeOf<STARTUPINFOEX>();

        // Initialize attribute list
        var attributeListSize = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);

        startupInfoEx.lpAttributeList = Marshal.AllocHGlobal(attributeListSize);

        if (!InitializeProcThreadAttributeList(startupInfoEx.lpAttributeList, 1, 0, ref attributeListSize))
        {
            Marshal.FreeHGlobal(startupInfoEx.lpAttributeList);
            ClosePseudoConsole(pseudoConsoleHandle);
            inputPipeWrite.Dispose();
            outputPipeRead.Dispose();
            throw new InvalidOperationException($"Failed to initialize attribute list: {Marshal.GetLastWin32Error()}");
        }

        // Set pseudo console attribute
        var pseudoConsolePtr = Marshal.AllocHGlobal(IntPtr.Size);
        Marshal.WriteIntPtr(pseudoConsolePtr, pseudoConsoleHandle);

        if (!UpdateProcThreadAttribute(startupInfoEx.lpAttributeList, 0,
                new IntPtr(PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE), pseudoConsolePtr,
                new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero))
        {
            Marshal.FreeHGlobal(pseudoConsolePtr);
            DeleteProcThreadAttributeList(startupInfoEx.lpAttributeList);
            Marshal.FreeHGlobal(startupInfoEx.lpAttributeList);
            ClosePseudoConsole(pseudoConsoleHandle);
            inputPipeWrite.Dispose();
            outputPipeRead.Dispose();
            throw new InvalidOperationException($"Failed to set pseudo console attribute: {Marshal.GetLastWin32Error()}");
        }

        // Create process
        var processAttributes = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>() };
        var threadAttributes = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>() };

        var success = CreateProcess(null, command, ref processAttributes, ref threadAttributes,
            false, EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, null, ref startupInfoEx, out processInfo);

        // Cleanup
        Marshal.FreeHGlobal(pseudoConsolePtr);
        DeleteProcThreadAttributeList(startupInfoEx.lpAttributeList);
        Marshal.FreeHGlobal(startupInfoEx.lpAttributeList);

        if (!success)
        {
            ClosePseudoConsole(pseudoConsoleHandle);
            inputPipeWrite.Dispose();
            outputPipeRead.Dispose();
            throw new InvalidOperationException($"Failed to create process: {Marshal.GetLastWin32Error()}");
        }

        return new ConPtySession(inputPipeWrite, outputPipeRead, pseudoConsoleHandle,
            processInfo.hProcess, processInfo.hThread, (uint)processInfo.dwProcessId);
    }

    private ConPtySession(SafeFileHandle inputPipeWrite, SafeFileHandle outputPipeRead,
        IntPtr pseudoConsoleHandle, IntPtr processHandle, IntPtr threadHandle, uint processId)
    {
        _inputPipeWrite = inputPipeWrite;
        _outputPipeRead = outputPipeRead;
        _pseudoConsoleHandle = pseudoConsoleHandle;
        _processHandle = processHandle;
        _threadHandle = threadHandle;
        _processId = processId;

        StartOutputReader();
        StartProcessMonitor();
    }

    public void WriteInput(string input)
    {
        if (_disposed) return;

        var bytes = Encoding.UTF8.GetBytes(input);
        WriteInput(bytes);
    }

    public void WriteInput(byte[] data)
    {
        if (_disposed) return;

        try
        {
            using var stream = new FileStream(_inputPipeWrite, FileAccess.Write);
            stream.Write(data);
            stream.Flush();
        }
        catch (Exception ex)
        {
            // Log error but don't throw - connection might be closed
            Console.WriteLine($"Error writing to ConPTY: {ex.Message}");
        }
    }

    public void Resize(int cols, int rows)
    {
        if (_disposed) return;

        var coordSize = new COORD((short)cols, (short)rows);
        var result = ResizePseudoConsole(_pseudoConsoleHandle, coordSize);
        if (result != S_OK)
        {
            Console.WriteLine($"Failed to resize pseudo console: {result}");
        }
    }

    public void SendSignal(string signal)
    {
        if (_disposed) return;

        switch (signal.ToUpperInvariant())
        {
            case "INT":
            case "CTRL_C":
                GenerateConsoleCtrlEvent(CTRL_C_EVENT, _processId);
                break;
            case "BREAK":
            case "CTRL_BREAK":
                GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, _processId);
                break;
        }
    }

    private void StartOutputReader()
    {
        Task.Run(async () =>
        {
            var buffer = new byte[4096];
            using var stream = new FileStream(_outputPipeRead, FileAccess.Read);

            try
            {
                while (!_disposed)
                {
                    var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                    if (bytesRead == 0) break;

                    var data = new byte[bytesRead];
                    Array.Copy(buffer, data, bytesRead);
                    DataReceived?.Invoke(data);
                }
            }
            catch (Exception ex)
            {
                if (!_disposed)
                {
                    Console.WriteLine($"Output reader error: {ex.Message}");
                }
            }
        });
    }

    private void StartProcessMonitor()
    {
        Task.Run(async () =>
        {
            try
            {
                while (!_disposed)
                {
                    var result = WaitForSingleObject(_processHandle, 1000);
                    if (result == 0) // WAIT_OBJECT_0
                    {
                        ProcessExited?.Invoke();
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Process monitor error: {ex.Message}");
            }
        });
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            _inputPipeWrite?.Dispose();
            _outputPipeRead?.Dispose();

            if (_processHandle != IntPtr.Zero)
                CloseHandle(_processHandle);

            if (_threadHandle != IntPtr.Zero)
                CloseHandle(_threadHandle);

            if (_pseudoConsoleHandle != IntPtr.Zero)
                ClosePseudoConsole(_pseudoConsoleHandle);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error disposing ConPTY session: {ex.Message}");
        }
    }
}