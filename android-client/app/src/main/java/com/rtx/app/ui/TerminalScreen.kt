package com.rtx.app.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch

@Composable
fun TerminalScreen(
    modifier: Modifier = Modifier,
    viewModel: TerminalViewModel = viewModel()
) {
    val terminalState by viewModel.terminalState.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val inputText by viewModel.inputText.collectAsState()

    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current

    // Auto-scroll to bottom when new content arrives
    LaunchedEffect(terminalState.outputLines.size) {
        if (terminalState.outputLines.isNotEmpty()) {
            coroutineScope.launch {
                listState.animateScrollToItem(terminalState.outputLines.size - 1)
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .padding(8.dp)
    ) {
        // Connection status bar
        ConnectionStatusBar(
            connectionState = connectionState,
            onConnect = { viewModel.connect() },
            onDisconnect = { viewModel.disconnect() }
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Terminal output area
        Card(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color.Black
            )
        ) {
            SelectionContainer {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    verticalArrangement = Arrangement.Bottom
                ) {
                    items(terminalState.outputLines) { line ->
                        Text(
                            text = line,
                            color = Color.Green,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    // Show cursor
                    if (connectionState == ConnectionState.Connected) {
                        item {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "> ",
                                    color = Color.Green,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = inputText + "█",
                                    color = Color.Green,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Input area
        InputArea(
            inputText = inputText,
            onInputChange = { viewModel.updateInputText(it) },
            onSendCommand = {
                viewModel.sendCommand()
                keyboardController?.hide()
            },
            onVoiceInput = { viewModel.startVoiceInput() },
            connectionState = connectionState,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Navigation keys
        NavigationKeys(
            onKeyPress = { key -> viewModel.sendKey(key) },
            enabled = connectionState == ConnectionState.Connected,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun ConnectionStatusBar(
    connectionState: ConnectionState,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when (connectionState) {
                ConnectionState.Connected -> Color.Green.copy(alpha = 0.2f)
                ConnectionState.Connecting -> Color.Yellow.copy(alpha = 0.2f)
                ConnectionState.Disconnected -> Color.Red.copy(alpha = 0.2f)
                ConnectionState.Error -> Color.Red.copy(alpha = 0.3f)
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = when (connectionState) {
                        ConnectionState.Connected -> Icons.Default.CheckCircle
                        ConnectionState.Connecting -> Icons.Default.Refresh
                        ConnectionState.Disconnected -> Icons.Default.RadioButtonUnchecked
                        ConnectionState.Error -> Icons.Default.Error
                    },
                    contentDescription = null,
                    tint = when (connectionState) {
                        ConnectionState.Connected -> Color.Green
                        ConnectionState.Connecting -> Color.Yellow
                        ConnectionState.Disconnected -> Color.Gray
                        ConnectionState.Error -> Color.Red
                    }
                )

                Spacer(modifier = Modifier.width(8.dp))

                Text(
                    text = when (connectionState) {
                        ConnectionState.Connected -> "Connected"
                        ConnectionState.Connecting -> "Connecting..."
                        ConnectionState.Disconnected -> "Disconnected"
                        ConnectionState.Error -> "Connection Error"
                    },
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            Button(
                onClick = if (connectionState == ConnectionState.Connected) onDisconnect else onConnect,
                enabled = connectionState != ConnectionState.Connecting,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (connectionState == ConnectionState.Connected)
                        Color.Red else MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = if (connectionState == ConnectionState.Connected) "Disconnect" else "Connect"
                )
            }
        }
    }
}

@Composable
fun InputArea(
    inputText: String,
    onInputChange: (String) -> Unit,
    onSendCommand: () -> Unit,
    onVoiceInput: () -> Unit,
    connectionState: ConnectionState,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = inputText,
            onValueChange = onInputChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Type command and press Enter") },
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Send,
                keyboardType = KeyboardType.Text
            ),
            keyboardActions = KeyboardActions(
                onSend = { onSendCommand() }
            ),
            enabled = connectionState == ConnectionState.Connected,
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.Green,
                unfocusedTextColor = Color.Gray,
                focusedBorderColor = Color.Green,
                cursorColor = Color.Green
            )
        )

        IconButton(
            onClick = onSendCommand,
            enabled = connectionState == ConnectionState.Connected && inputText.isNotBlank()
        ) {
            Icon(
                imageVector = Icons.Default.Send,
                contentDescription = "Send",
                tint = if (connectionState == ConnectionState.Connected && inputText.isNotBlank())
                    Color.Green else Color.Gray
            )
        }

        IconButton(
            onClick = onVoiceInput,
            enabled = connectionState == ConnectionState.Connected
        ) {
            Icon(
                imageVector = Icons.Default.Mic,
                contentDescription = "Voice Input",
                tint = if (connectionState == ConnectionState.Connected) Color.Green else Color.Gray
            )
        }
    }
}

@Composable
fun NavigationKeys(
    onKeyPress: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val keyColor = if (enabled) Color.Green else Color.Gray
    val backgroundColor = if (enabled) Color.Green.copy(alpha = 0.1f) else Color.Gray.copy(alpha = 0.1f)

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Arrow keys
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            NavigationKey("↑", "UP", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("Ctrl", "CTRL", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("Esc", "ESC", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("Tab", "TAB", onKeyPress, enabled, keyColor, backgroundColor)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            NavigationKey("←", "LEFT", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("↓", "DOWN", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("→", "RIGHT", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("⌫", "BACKSPACE", onKeyPress, enabled, keyColor, backgroundColor)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            NavigationKey("Home", "HOME", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("End", "END", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("PgUp", "PGUP", onKeyPress, enabled, keyColor, backgroundColor)
            NavigationKey("PgDn", "PGDN", onKeyPress, enabled, keyColor, backgroundColor)
        }
    }
}

@Composable
fun NavigationKey(
    label: String,
    key: String,
    onKeyPress: (String) -> Unit,
    enabled: Boolean,
    keyColor: Color,
    backgroundColor: Color
) {
    Box(
        modifier = Modifier
            .size(60.dp, 40.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .border(1.dp, keyColor, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center
    ) {
        TextButton(
            onClick = { if (enabled) onKeyPress(key) },
            enabled = enabled,
            modifier = Modifier.fillMaxSize()
        ) {
            Text(
                text = label,
                color = keyColor,
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

enum class ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error
}

data class TerminalState(
    val outputLines: List<String> = emptyList(),
    val isScrolledToBottom: Boolean = true
)