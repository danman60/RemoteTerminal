package com.rtx.app.net

import com.rtx.app.protocol.Protocol
import com.rtx.app.security.CertPinning
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
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
    var onMessageReceived: ((Protocol.BaseMessage) -> Unit)? = null
    var onOutputReceived: ((String) -> Unit)? = null

    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    suspend fun connect(hostAddress: String, deviceKey: String? = null) = withContext(Dispatchers.IO) {
        try {
            onConnectionStateChanged?.invoke(State.CONNECTING)

            val client = createOkHttpClient()
            val request = Request.Builder()
                .url(hostAddress)
                .build()

            webSocket = client.newWebSocket(request, createWebSocketListener())
            okHttpClient = client

        } catch (e: Exception) {
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

    suspend fun sendMessage(message: Protocol.BaseMessage) = withContext(Dispatchers.IO) {
        try {
            val messageJson = when (message) {
                is Protocol.AuthMessage -> json.encodeToString(Protocol.AuthMessage.serializer(), message)
                is Protocol.StdinInputMessage -> json.encodeToString(Protocol.StdinInputMessage.serializer(), message)
                is Protocol.ResizeMessage -> json.encodeToString(Protocol.ResizeMessage.serializer(), message)
                is Protocol.SignalMessage -> json.encodeToString(Protocol.SignalMessage.serializer(), message)
                is Protocol.PingMessage -> json.encodeToString(Protocol.PingMessage.serializer(), message)
                else -> return@withContext
            }

            webSocket?.send(messageJson)
        } catch (e: Exception) {
            onConnectionStateChanged?.invoke(State.ERROR)
        }
    }

    private fun createOkHttpClient(): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        // Get certificate pinning configuration
        val (sslSocketFactory, trustManager) = CertPinning.createPinnedSSLContext()

        return OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .sslSocketFactory(sslSocketFactory, trustManager)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS) // No read timeout for persistent connection
            .writeTimeout(30, TimeUnit.SECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun createWebSocketListener(): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onConnectionStateChanged?.invoke(State.CONNECTED)

                // Send authentication message
                coroutineScope.launch {
                    val deviceKey = getStoredDeviceKey() ?: generateAndStoreDeviceKey()
                    val authMessage = Protocol.AuthMessage(
                        deviceKey = deviceKey,
                        hostId = "", // Will be set by discovery or manual entry
                        clientVersion = "1.0.0"
                    )
                    sendMessage(authMessage)
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                coroutineScope.launch {
                    try {
                        parseAndHandleMessage(text)
                    } catch (e: Exception) {
                        onOutputReceived?.invoke("Error parsing message: ${e.message}")
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                onConnectionStateChanged?.invoke(State.DISCONNECTED)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onConnectionStateChanged?.invoke(State.DISCONNECTED)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
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
                "auth_ok" -> json.decodeFromString<Protocol.AuthOkMessage>(messageText)
                "stdout_chunk" -> json.decodeFromString<Protocol.StdoutChunkMessage>(messageText)
                "error" -> json.decodeFromString<Protocol.ErrorMessage>(messageText)
                "pong" -> json.decodeFromString<Protocol.PongMessage>(messageText)
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