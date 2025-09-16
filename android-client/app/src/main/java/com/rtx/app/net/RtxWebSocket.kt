package com.rtx.app.net

import com.rtx.app.protocol.*
import com.rtx.app.security.CertPinning
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.*
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

class RtxWebSocket {
    enum class State {
        DISCONNECTED, CONNECTING, CONNECTED, ERROR
    }

    private var webSocket: WebSocket? = null
    private var okHttpClient: OkHttpClient? = null
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    var onConnectionStateChanged: ((State) -> Unit)? = null
    var onMessageReceived: ((BaseMessage) -> Unit)? = null
    var onOutputReceived: ((String) -> Unit)? = null

    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    suspend fun connect(hostAddress: String, deviceKey: String? = null) = withContext(Dispatchers.IO) {
        try {
            onOutputReceived?.invoke("🔍 DEBUG: Starting connection to $hostAddress")
            onConnectionStateChanged?.invoke(State.CONNECTING)

            // Log connection details
            val isSecure = hostAddress.startsWith("wss://")
            onOutputReceived?.invoke("🔍 DEBUG: Connection type: ${if (isSecure) "Secure (WSS)" else "Plain (WS)"}")

            val client = createOkHttpClient(hostAddress)
            onOutputReceived?.invoke("🔍 DEBUG: OkHttpClient created successfully")

            val request = Request.Builder()
                .url(hostAddress)
                .build()
            onOutputReceived?.invoke("🔍 DEBUG: WebSocket request built for URL: ${request.url}")

            onOutputReceived?.invoke("🔍 DEBUG: Initiating WebSocket connection...")
            webSocket = client.newWebSocket(request, createWebSocketListener())
            okHttpClient = client
            onOutputReceived?.invoke("🔍 DEBUG: WebSocket connection initiated")

        } catch (e: Exception) {
            onOutputReceived?.invoke("❌ DEBUG: Connection setup failed: ${e.javaClass.simpleName}: ${e.message}")
            onOutputReceived?.invoke("❌ DEBUG: Stack trace: ${e.stackTraceToString()}")
            onConnectionStateChanged?.invoke(State.ERROR)
            throw e
        }
    }

    fun disconnect() {
        webSocket?.close(1000, "User requested disconnect")
        webSocket = null
        okHttpClient?.dispatcher?.executorService?.shutdown()
        okHttpClient = null
        onConnectionStateChanged?.invoke(State.DISCONNECTED)
    }

    suspend fun sendMessage(message: BaseMessage) = withContext(Dispatchers.IO) {
        try {
            val messageJson = when (message) {
                is AuthMessage -> json.encodeToString(AuthMessage.serializer(), message)
                is StdinInputMessage -> json.encodeToString(StdinInputMessage.serializer(), message)
                is ResizeMessage -> json.encodeToString(ResizeMessage.serializer(), message)
                is SignalMessage -> json.encodeToString(SignalMessage.serializer(), message)
                is PingMessage -> json.encodeToString(PingMessage.serializer(), message)
                else -> return@withContext
            }

            webSocket?.send(messageJson)
        } catch (e: Exception) {
            onConnectionStateChanged?.invoke(State.ERROR)
        }
    }

    private fun createOkHttpClient(hostAddress: String): OkHttpClient {
        onOutputReceived?.invoke("🔍 DEBUG: Creating OkHttpClient for $hostAddress")

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY // More detailed logging
        }

        val builder = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS) // No read timeout for persistent connection
            .writeTimeout(30, TimeUnit.SECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)

        // Only apply SSL certificate pinning for secure connections (wss://)
        if (hostAddress.startsWith("wss://")) {
            onOutputReceived?.invoke("🔍 DEBUG: Applying SSL certificate pinning for secure connection")
            val (sslSocketFactory, trustManager) = CertPinning.createPinnedSSLContext()
            builder.sslSocketFactory(sslSocketFactory, trustManager)
        } else {
            onOutputReceived?.invoke("🔍 DEBUG: Using plain connection (no SSL)")
        }

        onOutputReceived?.invoke("🔍 DEBUG: OkHttpClient configuration:")
        onOutputReceived?.invoke("  - Connect timeout: 30s")
        onOutputReceived?.invoke("  - Read timeout: None (persistent)")
        onOutputReceived?.invoke("  - Write timeout: 30s")
        onOutputReceived?.invoke("  - Ping interval: 30s")
        onOutputReceived?.invoke("  - Retry on failure: true")

        return builder.build()
    }

    private fun createWebSocketListener(): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onOutputReceived?.invoke("✅ DEBUG: WebSocket connection opened successfully")
                onOutputReceived?.invoke("🔍 DEBUG: Response code: ${response.code}")
                onOutputReceived?.invoke("🔍 DEBUG: Response message: ${response.message}")
                onOutputReceived?.invoke("🔍 DEBUG: Protocol: ${response.protocol}")
                onConnectionStateChanged?.invoke(State.CONNECTED)

                // Send authentication message
                coroutineScope.launch {
                    try {
                        val deviceKey = getStoredDeviceKey() ?: generateAndStoreDeviceKey()
                        onOutputReceived?.invoke("🔍 DEBUG: Using device key: ${deviceKey.take(8)}...")
                        val authMessage = AuthMessage(
                            deviceKey = deviceKey,
                            hostId = "", // Will be set by discovery or manual entry
                            clientVersion = "1.0.0"
                        )
                        onOutputReceived?.invoke("🔍 DEBUG: Sending authentication message")
                        sendMessage(authMessage)
                    } catch (e: Exception) {
                        onOutputReceived?.invoke("❌ DEBUG: Auth message failed: ${e.message}")
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                onOutputReceived?.invoke("📨 DEBUG: Received message: ${text.take(100)}${if (text.length > 100) "..." else ""}")
                coroutineScope.launch {
                    try {
                        parseAndHandleMessage(text)
                    } catch (e: Exception) {
                        onOutputReceived?.invoke("❌ DEBUG: Error parsing message: ${e.javaClass.simpleName}: ${e.message}")
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                onOutputReceived?.invoke("⚠️ DEBUG: WebSocket closing - Code: $code, Reason: $reason")
                onConnectionStateChanged?.invoke(State.DISCONNECTED)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onOutputReceived?.invoke("🔒 DEBUG: WebSocket closed - Code: $code, Reason: $reason")
                onConnectionStateChanged?.invoke(State.DISCONNECTED)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onOutputReceived?.invoke("❌ DEBUG: WebSocket failure occurred")
                onOutputReceived?.invoke("❌ DEBUG: Exception: ${t.javaClass.simpleName}: ${t.message}")
                onOutputReceived?.invoke("❌ DEBUG: Response: ${response?.code} - ${response?.message}")
                onOutputReceived?.invoke("❌ DEBUG: Stack trace: ${t.stackTraceToString()}")

                // Additional network diagnostics
                if (t.message?.contains("Failed to connect") == true) {
                    onOutputReceived?.invoke("🔍 DEBUG: Network connectivity issue detected")
                    onOutputReceived?.invoke("🔍 DEBUG: Check if the server is running and accessible")
                }

                onConnectionStateChanged?.invoke(State.ERROR)
                onOutputReceived?.invoke("Connection failed: ${t.message}")
            }
        }
    }

    private fun parseAndHandleMessage(messageText: String) {
        try {
            // Parse message type first
            val jsonElement = json.parseToJsonElement(messageText)
            val messageType = jsonElement.jsonObject["type"]?.jsonPrimitive?.content

            val message = when (messageType) {
                "auth_ok" -> json.decodeFromString<AuthOkMessage>(messageText)
                "stdout_chunk" -> json.decodeFromString<StdoutChunkMessage>(messageText)
                "error" -> json.decodeFromString<ErrorMessage>(messageText)
                "pong" -> json.decodeFromString<PongMessage>(messageText)
                else -> {
                    onOutputReceived?.invoke("Unknown message type: $messageType")
                    return
                }
            }

            onMessageReceived?.invoke(message)

        } catch (e: Exception) {
            onOutputReceived?.invoke("Error parsing message: ${e.message}")
        }
    }

    private fun getStoredDeviceKey(): String? {
        // TODO: Implement secure storage using EncryptedSharedPreferences
        // For now, return null to trigger generation
        return null
    }

    private fun generateAndStoreDeviceKey(): String {
        // TODO: Implement device key generation and secure storage
        // For now, return a placeholder
        return "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"
    }

    fun cleanup() {
        disconnect()
        coroutineScope.cancel()
    }
}