package com.rtx.app.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.Date

@Serializable
abstract class BaseMessage {
    @SerialName("type")
    abstract val type: String
    @SerialName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
}

@Serializable
@SerialName("auth")
data class AuthMessage(
    @SerialName("device_key")
    val deviceKey: String,
    @SerialName("host_id")
    val hostId: String,
    @SerialName("client_version")
    val clientVersion: String
) : BaseMessage() {
    override val type: String = "auth"
}

@Serializable
@SerialName("auth_ok")
data class AuthOkMessage(
    val pty: PtyInfo,
    val shell: String
) : BaseMessage() {
    override val type: String = "auth_ok"
}

@Serializable
data class PtyInfo(
    val cols: Int,
    val rows: Int
)

@Serializable
@SerialName("stdin_input")
data class StdinInputMessage(
    val mode: String, // "text" or "vt"
    val data: String
) : BaseMessage() {
    override val type: String = "stdin_input"
}

@Serializable
@SerialName("stdout_chunk")
data class StdoutChunkMessage(
    val data: String // Base64 encoded terminal output
) : BaseMessage() {
    override val type: String = "stdout_chunk"
}

@Serializable
@SerialName("resize")
data class ResizeMessage(
    val cols: Int,
    val rows: Int
) : BaseMessage() {
    override val type: String = "resize"
}

@Serializable
@SerialName("signal")
data class SignalMessage(
    val name: String
) : BaseMessage() {
    override val type: String = "signal"
}

@Serializable
@SerialName("ping")
class PingMessage : BaseMessage() {
    override val type: String = "ping"
}

@Serializable
@SerialName("pong")
class PongMessage : BaseMessage() {
    override val type: String = "pong"
}

@Serializable
@SerialName("error")
data class ErrorMessage(
    val message: String,
    val code: String
) : BaseMessage() {
    override val type: String = "error"
}

// Factory methods for creating protocol messages
object Protocol {
    fun createAuthMessage(deviceKey: String, hostId: String, clientVersion: String = "1.0.0"): AuthMessage {
        return AuthMessage(deviceKey, hostId, clientVersion)
    }

    fun createStdinInputMessage(text: String): StdinInputMessage {
        return StdinInputMessage("text", text)
    }

    fun createVtInputMessage(vtSequence: String): StdinInputMessage {
        return StdinInputMessage("vt", vtSequence)
    }

    fun createResizeMessage(cols: Int, rows: Int): ResizeMessage {
        return ResizeMessage(cols, rows)
    }

    fun createSignalMessage(signal: String): SignalMessage {
        return SignalMessage(signal)
    }

    fun createPingMessage(): PingMessage {
        return PingMessage()
    }
}