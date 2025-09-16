package com.rtx.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rtx.app.net.RtxWebSocket
import com.rtx.app.protocol.*
import com.rtx.app.protocol.Protocol.createStdinInputMessage
import com.rtx.app.protocol.Protocol.createVtInputMessage
import com.rtx.app.protocol.Protocol.createResizeMessage
import com.rtx.app.protocol.Protocol.createSignalMessage
import com.rtx.app.input.KeyMapper
import com.rtx.app.input.VoiceInput
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TerminalViewModel : ViewModel() {
    private val _connectionState = MutableStateFlow(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _terminalState = MutableStateFlow(TerminalState())
    val terminalState: StateFlow<TerminalState> = _terminalState.asStateFlow()

    private val _inputText = MutableStateFlow("")
    val inputText: StateFlow<String> = _inputText.asStateFlow()

    private val webSocket = RtxWebSocket()
    private val keyMapper = KeyMapper()
    private val voiceInput = VoiceInput()

    init {
        setupWebSocketCallbacks()
    }

    private fun setupWebSocketCallbacks() {
        webSocket.onConnectionStateChanged = { state ->
            _connectionState.value = when (state) {
                RtxWebSocket.State.CONNECTING -> ConnectionState.Connecting
                RtxWebSocket.State.CONNECTED -> ConnectionState.Connected
                RtxWebSocket.State.DISCONNECTED -> ConnectionState.Disconnected
                RtxWebSocket.State.ERROR -> ConnectionState.Error
            }
        }

        webSocket.onMessageReceived = { message ->
            handleIncomingMessage(message)
        }

        webSocket.onOutputReceived = { data ->
            appendOutput(data)
        }
    }

    fun connect(hostAddress: String = "ws://107.179.180.231:8082") {
        viewModelScope.launch {
            try {
                appendOutput("🚀 Attempting to connect to: $hostAddress")
                appendOutput("📱 Android device starting connection process...")

                // Add network diagnostics
                val uri = java.net.URI(hostAddress)
                appendOutput("🔍 Parsed URL components:")
                appendOutput("  - Scheme: ${uri.scheme}")
                appendOutput("  - Host: ${uri.host}")
                appendOutput("  - Port: ${uri.port}")
                appendOutput("  - Path: ${uri.path}")

                webSocket.connect(hostAddress)
            } catch (e: Exception) {
                appendOutput("❌ Connection setup error: ${e.javaClass.simpleName}")
                appendOutput("❌ Error message: ${e.message}")
                appendOutput("❌ Stack trace: ${e.stackTraceToString()}")
                _connectionState.value = ConnectionState.Error
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            webSocket.disconnect()
        }
    }

    fun updateInputText(text: String) {
        _inputText.value = text
    }

    fun sendCommand() {
        val command = _inputText.value
        if (command.isNotBlank() && _connectionState.value == ConnectionState.Connected) {
            viewModelScope.launch {
                val message = createStdinInputMessage(command + "\r\n")
                webSocket.sendMessage(message)
                _inputText.value = ""
            }
        }
    }

    fun sendKey(key: String) {
        if (_connectionState.value == ConnectionState.Connected) {
            viewModelScope.launch {
                val vtSequence = keyMapper.mapKey(key)
                if (vtSequence != null) {
                    val message = createVtInputMessage(vtSequence)
                    webSocket.sendMessage(message)
                }
            }
        }
    }

    fun startVoiceInput() {
        if (_connectionState.value == ConnectionState.Connected) {
            voiceInput.startListening { result ->
                if (result.isNotEmpty()) {
                    _inputText.value = result
                }
            }
        }
    }

    fun resizeTerminal(cols: Int, rows: Int) {
        if (_connectionState.value == ConnectionState.Connected) {
            viewModelScope.launch {
                val message = createResizeMessage(cols, rows)
                webSocket.sendMessage(message)
            }
        }
    }

    fun sendSignal(signal: String) {
        if (_connectionState.value == ConnectionState.Connected) {
            viewModelScope.launch {
                val message = createSignalMessage(signal)
                webSocket.sendMessage(message)
            }
        }
    }

    private fun handleIncomingMessage(message: BaseMessage) {
        when (message) {
            is AuthOkMessage -> {
                appendOutput("Terminal connected - ${message.shell} (${message.pty.cols}x${message.pty.rows})")
            }
            is StdoutChunkMessage -> {
                // Data is base64 encoded
                try {
                    val decoded = android.util.Base64.decode(message.data, android.util.Base64.DEFAULT)
                    val text = String(decoded, Charsets.UTF_8)
                    appendOutput(text, raw = true)
                } catch (e: Exception) {
                    appendOutput("Error decoding output: ${e.message}")
                }
            }
            is ErrorMessage -> {
                appendOutput("Error: ${message.message}")
            }
            is PongMessage -> {
                // Handle keepalive response
            }
        }
    }

    private fun appendOutput(text: String, raw: Boolean = false) {
        val currentState = _terminalState.value
        val lines = if (raw) {
            // Handle raw terminal output with ANSI sequences
            processRawOutput(text)
        } else {
            listOf(text)
        }

        val newLines = (currentState.outputLines + lines).takeLast(1000) // Limit output buffer

        _terminalState.value = currentState.copy(
            outputLines = newLines
        )
    }

    private fun processRawOutput(rawText: String): List<String> {
        // Simple ANSI processing - strip ANSI escape sequences for display
        val ansiRegex = "\u001B\\[[;\\d]*m".toRegex()
        val cleanText = rawText.replace(ansiRegex, "")

        // Split by lines and handle carriage returns
        return cleanText.split('\n').map { line ->
            line.replace('\r', ' ').trimEnd()
        }.filter { it.isNotEmpty() || cleanText.contains('\n') }
    }

    override fun onCleared() {
        super.onCleared()
        webSocket.disconnect()
        voiceInput.cleanup()
    }
}