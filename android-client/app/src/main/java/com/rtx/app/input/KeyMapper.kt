package com.rtx.app.input

/**
 * Maps Android key events to VT/ANSI escape sequences for terminal compatibility
 */
class KeyMapper {

    fun mapKey(key: String): String? {
        return when (key.uppercase()) {
            // Arrow keys
            "UP" -> "\u001b[A"
            "DOWN" -> "\u001b[B"
            "RIGHT" -> "\u001b[C"
            "LEFT" -> "\u001b[D"

            // Navigation keys
            "HOME" -> "\u001b[H"
            "END" -> "\u001b[F"
            "PGUP", "PAGEUP" -> "\u001b[5~"
            "PGDN", "PAGEDOWN" -> "\u001b[6~"

            // Editing keys
            "BACKSPACE" -> "\u007f"
            "DELETE", "DEL" -> "\u001b[3~"
            "INSERT", "INS" -> "\u001b[2~"

            // Function keys
            "F1" -> "\u001bOP"
            "F2" -> "\u001bOQ"
            "F3" -> "\u001bOR"
            "F4" -> "\u001bOS"
            "F5" -> "\u001b[15~"
            "F6" -> "\u001b[17~"
            "F7" -> "\u001b[18~"
            "F8" -> "\u001b[19~"
            "F9" -> "\u001b[20~"
            "F10" -> "\u001b[21~"
            "F11" -> "\u001b[23~"
            "F12" -> "\u001b[24~"

            // Tab key
            "TAB" -> "\t"
            "SHIFTTAB" -> "\u001b[Z"

            // Control keys
            "ESC", "ESCAPE" -> "\u001b"
            "ENTER" -> "\r\n"
            "SPACE" -> " "

            // Control sequences (Ctrl+letter)
            "CTRL_A" -> "\u0001"
            "CTRL_B" -> "\u0002"
            "CTRL_C" -> "\u0003"
            "CTRL_D" -> "\u0004"
            "CTRL_E" -> "\u0005"
            "CTRL_F" -> "\u0006"
            "CTRL_G" -> "\u0007"
            "CTRL_H" -> "\u0008"
            "CTRL_I" -> "\u0009"
            "CTRL_J" -> "\u000a"
            "CTRL_K" -> "\u000b"
            "CTRL_L" -> "\u000c"
            "CTRL_M" -> "\u000d"
            "CTRL_N" -> "\u000e"
            "CTRL_O" -> "\u000f"
            "CTRL_P" -> "\u0010"
            "CTRL_Q" -> "\u0011"
            "CTRL_R" -> "\u0012"
            "CTRL_S" -> "\u0013"
            "CTRL_T" -> "\u0014"
            "CTRL_U" -> "\u0015"
            "CTRL_V" -> "\u0016"
            "CTRL_W" -> "\u0017"
            "CTRL_X" -> "\u0018"
            "CTRL_Y" -> "\u0019"
            "CTRL_Z" -> "\u001a"

            // Common shortcuts
            "CTRL" -> null // Handle Ctrl key press without releasing

            else -> null
        }
    }

    /**
     * Maps a key combination like "Ctrl+C" to appropriate VT sequence
     */
    fun mapKeyCombo(key: String, modifiers: Set<String>): String? {
        val upperKey = key.uppercase()

        return when {
            modifiers.contains("CTRL") -> {
                when (upperKey) {
                    "A" -> "\u0001"
                    "B" -> "\u0002"
                    "C" -> "\u0003" // Ctrl+C (SIGINT)
                    "D" -> "\u0004" // Ctrl+D (EOF)
                    "L" -> "\u000c" // Ctrl+L (clear screen)
                    "U" -> "\u0015" // Ctrl+U (kill line)
                    "W" -> "\u0017" // Ctrl+W (kill word)
                    "Z" -> "\u001a" // Ctrl+Z (suspend)
                    else -> null
                }
            }
            modifiers.contains("SHIFT") -> {
                when (upperKey) {
                    "TAB" -> "\u001b[Z" // Shift+Tab
                    else -> null
                }
            }
            modifiers.contains("ALT") -> {
                when (upperKey) {
                    "BACKSPACE" -> "\u001b\u007f" // Alt+Backspace
                    else -> null
                }
            }
            else -> mapKey(key)
        }
    }

    /**
     * Convert bracketed paste mode content
     */
    fun wrapBracketedPaste(text: String): String {
        return "\u001b[200~$text\u001b[201~"
    }

    /**
     * Check if a key should be sent as a VT sequence vs regular text
     */
    fun isVtSequence(key: String): Boolean {
        return mapKey(key) != null
    }

    /**
     * Get display name for a key
     */
    fun getKeyDisplayName(key: String): String {
        return when (key.uppercase()) {
            "UP" -> "↑"
            "DOWN" -> "↓"
            "LEFT" -> "←"
            "RIGHT" -> "→"
            "BACKSPACE" -> "⌫"
            "DELETE" -> "⌦"
            "ENTER" -> "⏎"
            "TAB" -> "⇥"
            "SHIFTTAB" -> "⇤"
            "CTRL" -> "Ctrl"
            "ESC", "ESCAPE" -> "Esc"
            "HOME" -> "Home"
            "END" -> "End"
            "PGUP", "PAGEUP" -> "PgUp"
            "PGDN", "PAGEDOWN" -> "PgDn"
            "INSERT" -> "Ins"
            else -> key.lowercase().replaceFirstChar { it.uppercase() }
        }
    }

    companion object {
        // Common VT sequences for reference
        const val VT_CURSOR_UP = "\u001b[A"
        const val VT_CURSOR_DOWN = "\u001b[B"
        const val VT_CURSOR_RIGHT = "\u001b[C"
        const val VT_CURSOR_LEFT = "\u001b[D"
        const val VT_HOME = "\u001b[H"
        const val VT_END = "\u001b[F"
        const val VT_DELETE = "\u001b[3~"
        const val VT_PAGE_UP = "\u001b[5~"
        const val VT_PAGE_DOWN = "\u001b[6~"
        const val VT_CTRL_C = "\u0003"
        const val VT_CTRL_D = "\u0004"
        const val VT_CTRL_L = "\u000c"
        const val VT_CTRL_Z = "\u001a"

        // Bracketed paste markers
        const val BRACKET_PASTE_START = "\u001b[200~"
        const val BRACKET_PASTE_END = "\u001b[201~"
    }
}