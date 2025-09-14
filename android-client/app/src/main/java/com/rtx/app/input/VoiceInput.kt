package com.rtx.app.input

import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.RecognitionListener
import android.os.Bundle
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Voice input handler for speech-to-text command input
 */
class VoiceInput {
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    fun startListening(callback: (String) -> Unit) {
        // This is a placeholder implementation
        // In a real app, you'd need to implement proper speech recognition
        // using SpeechRecognizer and handle permissions

        // For now, simulate voice input
        callback("echo hello from voice")
    }

    suspend fun recognizeSpeech(context: Context): String = suspendCancellableCoroutine { continuation ->
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                continuation.resumeWithException(Exception("Speech recognition not available"))
                return@suspendCancellableCoroutine
            }

            val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
            this.speechRecognizer = speechRecognizer

            val recognitionIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }

            speechRecognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                }

                override fun onBeginningOfSpeech() {}

                override fun onRmsChanged(rmsdB: Float) {}

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    isListening = false
                }

                override fun onError(error: Int) {
                    isListening = false
                    speechRecognizer.destroy()
                    this@VoiceInput.speechRecognizer = null

                    val errorMessage = when (error) {
                        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                        SpeechRecognizer.ERROR_CLIENT -> "Client error"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                        SpeechRecognizer.ERROR_NETWORK -> "Network error"
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech match"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognition service busy"
                        SpeechRecognizer.ERROR_SERVER -> "Server error"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input"
                        else -> "Unknown error"
                    }

                    continuation.resumeWithException(Exception(errorMessage))
                }

                override fun onResults(results: Bundle?) {
                    isListening = false
                    speechRecognizer.destroy()
                    this@VoiceInput.speechRecognizer = null

                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val result = matches?.firstOrNull() ?: ""

                    continuation.resume(result)
                }

                override fun onPartialResults(partialResults: Bundle?) {}

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            continuation.invokeOnCancellation {
                speechRecognizer.cancel()
                speechRecognizer.destroy()
                this@VoiceInput.speechRecognizer = null
                isListening = false
            }

            speechRecognizer.startListening(recognitionIntent)

        } catch (e: Exception) {
            continuation.resumeWithException(e)
        }
    }

    fun stopListening() {
        if (isListening) {
            speechRecognizer?.stopListening()
        }
    }

    fun cleanup() {
        speechRecognizer?.destroy()
        speechRecognizer = null
        isListening = false
    }

    fun isListening(): Boolean {
        return isListening
    }

    companion object {
        /**
         * Check if speech recognition is available on this device
         */
        fun isAvailable(context: Context): Boolean {
            return SpeechRecognizer.isRecognitionAvailable(context)
        }

        /**
         * Get the speech recognition intent for launching external speech recognizer
         */
        fun createSpeechIntent(): Intent {
            return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your terminal command")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
        }
    }
}