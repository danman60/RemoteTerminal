package com.rtx.app.security

import android.util.Base64
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.*
import javax.security.auth.x500.X500Principal

/**
 * Certificate pinning implementation for secure connections
 */
object CertPinning {

    // Development certificate pins (generated from dev-config.txt)
    private val PINNED_CERTIFICATES = mapOf(
        // CA certificate pin
        "ca" to "IEt9OBD47HOVTxdWOwbB5+2zWV5ioCvRxrpX+/fnMuI=",
        // Relay server certificate pin
        "relay" to "c32asEmeiXEqsnjnkCTyY3UGyXOIRGJws3LSY5RE1HU=",
        // Host server certificate pin
        "host" to "d1E1sN8Wh4d1EUi3ctRT3wJ4NyqUtEIQB3T5MLYP7tc="
    )

    /**
     * Create an SSL context with certificate pinning
     */
    fun createPinnedSSLContext(): Pair<SSLSocketFactory, X509TrustManager> {
        val trustManager = PinnedTrustManager()
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf(trustManager), null)

        return Pair(sslContext.socketFactory, trustManager)
    }

    /**
     * Custom trust manager that validates certificate pins
     */
    private class PinnedTrustManager : X509TrustManager {

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
            // Not used for client connections
        }

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            if (chain.isEmpty()) {
                throw SSLException("Certificate chain is empty")
            }

            // Validate certificate chain
            val serverCert = chain[0]
            val pin = calculateSPKIPin(serverCert)

            // Check against known pins
            val isValidPin = PINNED_CERTIFICATES.values.any { pinnedPin ->
                pin == pinnedPin
            }

            if (!isValidPin) {
                throw SSLException("Certificate pin validation failed. Pin: $pin")
            }

            // Additional validation - check certificate validity
            try {
                serverCert.checkValidity()
            } catch (e: Exception) {
                throw SSLException("Certificate validation failed: ${e.message}", e)
            }

            // Validate certificate chain if more than one cert
            if (chain.size > 1) {
                for (i in 0 until chain.size - 1) {
                    try {
                        chain[i].verify(chain[i + 1].publicKey)
                    } catch (e: Exception) {
                        throw SSLException("Certificate chain validation failed: ${e.message}", e)
                    }
                }
            }
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> {
            return emptyArray()
        }

        /**
         * Calculate SPKI (Subject Public Key Info) SHA-256 pin for certificate
         */
        private fun calculateSPKIPin(certificate: X509Certificate): String {
            val publicKeyInfo = certificate.publicKey.encoded
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(publicKeyInfo)
            return Base64.encodeToString(hash, Base64.NO_WRAP)
        }
    }

    /**
     * Validate hostname against certificate subject
     */
    fun validateHostname(hostname: String, certificate: X509Certificate): Boolean {
        return try {
            val subjectPrincipal = certificate.subjectX500Principal
            val subjectName = subjectPrincipal.getName(X500Principal.RFC1779)

            // Extract CN from subject
            val cnRegex = "CN=([^,]+)".toRegex()
            val cnMatch = cnRegex.find(subjectName)
            val commonName = cnMatch?.groupValues?.get(1)?.trim()

            when {
                commonName == hostname -> true
                commonName?.startsWith("*.") == true -> {
                    // Wildcard certificate
                    val domain = commonName.substring(2)
                    hostname.endsWith(".$domain") || hostname == domain
                }
                else -> false
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Update certificate pins (for development use)
     */
    fun updatePins(newPins: Map<String, String>) {
        // In production, this should be more secure
        // For development, we can allow runtime pin updates
    }

    /**
     * Get current certificate pins for debugging
     */
    fun getCurrentPins(): Map<String, String> {
        return PINNED_CERTIFICATES.toMap()
    }

    /**
     * Create a hostname verifier that uses our certificate pinning
     */
    fun createHostnameVerifier(): HostnameVerifier {
        return HostnameVerifier { hostname, session ->
            try {
                val certificates = session.peerCertificates
                if (certificates.isEmpty()) return@HostnameVerifier false

                val serverCert = certificates[0] as X509Certificate
                validateHostname(hostname, serverCert)
            } catch (e: Exception) {
                false
            }
        }
    }

    /**
     * Calculate pin for a given certificate (utility function)
     */
    fun calculatePin(certificate: X509Certificate): String {
        val publicKeyInfo = certificate.publicKey.encoded
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(publicKeyInfo)
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    /**
     * Verify certificate chain is properly formed
     */
    fun verifyCertificateChain(chain: Array<X509Certificate>): Boolean {
        return try {
            for (i in 0 until chain.size - 1) {
                chain[i].verify(chain[i + 1].publicKey)
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}