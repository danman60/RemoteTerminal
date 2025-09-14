package com.rtx.app.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * LAN discovery for finding RTX hosts on the local network
 */
class LanDiscovery(private val context: Context) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _discoveredHosts = MutableStateFlow<List<DiscoveredHost>>(emptyList())
    val discoveredHosts: StateFlow<List<DiscoveredHost>> = _discoveredHosts.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val resolveListeners = mutableMapOf<String, NsdManager.ResolveListener>()

    fun startDiscovery(serviceType: String = "_rtx._tcp") {
        if (_isScanning.value) {
            return // Already scanning
        }

        _isScanning.value = true
        _discoveredHosts.value = emptyList()

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                _isScanning.value = false
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                _isScanning.value = false
            }

            override fun onDiscoveryStarted(serviceType: String) {
                // Discovery started successfully
            }

            override fun onDiscoveryStopped(serviceType: String) {
                _isScanning.value = false
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceType == serviceType) {
                    resolveService(serviceInfo)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                removeDiscoveredHost(serviceInfo.serviceName)
            }
        }

        try {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            _isScanning.value = false
        }
    }

    fun stopDiscovery() {
        discoveryListener?.let { listener ->
            try {
                nsdManager.stopServiceDiscovery(listener)
            } catch (e: Exception) {
                // Ignore errors when stopping
            }
        }
        discoveryListener = null
        resolveListeners.clear()
        _isScanning.value = false
    }

    private fun resolveService(serviceInfo: NsdServiceInfo) {
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                resolveListeners.remove(serviceInfo.serviceName)
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                resolveListeners.remove(serviceInfo.serviceName)
                addDiscoveredHost(serviceInfo)
            }
        }

        resolveListeners[serviceInfo.serviceName] = resolveListener

        try {
            nsdManager.resolveService(serviceInfo, resolveListener)
        } catch (e: Exception) {
            resolveListeners.remove(serviceInfo.serviceName)
        }
    }

    private fun addDiscoveredHost(serviceInfo: NsdServiceInfo) {
        val attributes = serviceInfo.attributes ?: mapOf()

        val host = DiscoveredHost(
            serviceName = serviceInfo.serviceName,
            hostId = String(attributes["host_id"] ?: ByteArray(0)),
            friendlyName = String(attributes["friendly_name"] ?: serviceInfo.serviceName.toByteArray()),
            address = serviceInfo.host?.hostAddress ?: "",
            port = serviceInfo.port,
            platform = String(attributes["platform"] ?: "unknown".toByteArray()),
            shell = String(attributes["shell"] ?: "unknown".toByteArray())
        )

        if (host.hostId.isNotEmpty() && host.address.isNotEmpty()) {
            val currentHosts = _discoveredHosts.value.toMutableList()
            val existingIndex = currentHosts.indexOfFirst { it.hostId == host.hostId }

            if (existingIndex >= 0) {
                currentHosts[existingIndex] = host
            } else {
                currentHosts.add(host)
            }

            _discoveredHosts.value = currentHosts
        }
    }

    private fun removeDiscoveredHost(serviceName: String) {
        val currentHosts = _discoveredHosts.value.toMutableList()
        currentHosts.removeAll { it.serviceName == serviceName }
        _discoveredHosts.value = currentHosts
    }

    fun cleanup() {
        stopDiscovery()
        coroutineScope.cancel()
    }
}

data class DiscoveredHost(
    val serviceName: String,
    val hostId: String,
    val friendlyName: String,
    val address: String,
    val port: Int,
    val platform: String,
    val shell: String,
    val discoveredAt: Long = System.currentTimeMillis()
) {
    val connectionUrl: String
        get() = "wss://$address:$port"

    val displayName: String
        get() = if (friendlyName.isNotBlank() && friendlyName != serviceName) {
            "$friendlyName ($address)"
        } else {
            "$serviceName ($address)"
        }
}