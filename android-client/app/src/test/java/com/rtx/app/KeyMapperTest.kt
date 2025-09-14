package com.rtx.app

import com.rtx.app.input.KeyMapper
import org.junit.Test
import org.junit.Assert.*

class KeyMapperTest {

    private val keyMapper = KeyMapper()

    @Test
    fun testArrowKeyMapping() {
        assertEquals("\u001b[A", keyMapper.mapKey("UP"))
        assertEquals("\u001b[B", keyMapper.mapKey("DOWN"))
        assertEquals("\u001b[C", keyMapper.mapKey("RIGHT"))
        assertEquals("\u001b[D", keyMapper.mapKey("LEFT"))
    }

    @Test
    fun testNavigationKeyMapping() {
        assertEquals("\u001b[H", keyMapper.mapKey("HOME"))
        assertEquals("\u001b[F", keyMapper.mapKey("END"))
        assertEquals("\u001b[5~", keyMapper.mapKey("PGUP"))
        assertEquals("\u001b[6~", keyMapper.mapKey("PGDN"))
    }

    @Test
    fun testEditingKeyMapping() {
        assertEquals("\u007f", keyMapper.mapKey("BACKSPACE"))
        assertEquals("\u001b[3~", keyMapper.mapKey("DELETE"))
        assertEquals("\u001b[2~", keyMapper.mapKey("INSERT"))
    }

    @Test
    fun testControlKeyMapping() {
        assertEquals("\u001b", keyMapper.mapKey("ESC"))
        assertEquals("\t", keyMapper.mapKey("TAB"))
        assertEquals("\u001b[Z", keyMapper.mapKey("SHIFTTAB"))
    }

    @Test
    fun testCtrlKeyComboMapping() {
        val ctrlModifiers = setOf("CTRL")
        assertEquals("\u0003", keyMapper.mapKeyCombo("C", ctrlModifiers)) // Ctrl+C
        assertEquals("\u0004", keyMapper.mapKeyCombo("D", ctrlModifiers)) // Ctrl+D
        assertEquals("\u000c", keyMapper.mapKeyCombo("L", ctrlModifiers)) // Ctrl+L
    }

    @Test
    fun testFunctionKeyMapping() {
        assertEquals("\u001bOP", keyMapper.mapKey("F1"))
        assertEquals("\u001bOQ", keyMapper.mapKey("F2"))
        assertEquals("\u001bOR", keyMapper.mapKey("F3"))
        assertEquals("\u001bOS", keyMapper.mapKey("F4"))
    }

    @Test
    fun testBracketedPaste() {
        val text = "hello world"
        val expected = "\u001b[200~hello world\u001b[201~"
        assertEquals(expected, keyMapper.wrapBracketedPaste(text))
    }

    @Test
    fun testVtSequenceDetection() {
        assertTrue(keyMapper.isVtSequence("UP"))
        assertTrue(keyMapper.isVtSequence("HOME"))
        assertTrue(keyMapper.isVtSequence("F1"))
        assertFalse(keyMapper.isVtSequence("UNKNOWN_KEY"))
    }

    @Test
    fun testKeyDisplayNames() {
        assertEquals("↑", keyMapper.getKeyDisplayName("UP"))
        assertEquals("↓", keyMapper.getKeyDisplayName("DOWN"))
        assertEquals("⌫", keyMapper.getKeyDisplayName("BACKSPACE"))
        assertEquals("Ctrl", keyMapper.getKeyDisplayName("CTRL"))
    }

    @Test
    fun testCaseInsensitiveMapping() {
        assertEquals("\u001b[A", keyMapper.mapKey("up"))
        assertEquals("\u001b[A", keyMapper.mapKey("Up"))
        assertEquals("\u001b[A", keyMapper.mapKey("UP"))
    }

    @Test
    fun testUnknownKeyMapping() {
        assertNull(keyMapper.mapKey("UNKNOWN_KEY"))
        assertNull(keyMapper.mapKey(""))
    }

    @Test
    fun testConstants() {
        assertEquals("\u001b[A", KeyMapper.VT_CURSOR_UP)
        assertEquals("\u001b[B", KeyMapper.VT_CURSOR_DOWN)
        assertEquals("\u0003", KeyMapper.VT_CTRL_C)
        assertEquals("\u001b[200~", KeyMapper.BRACKET_PASTE_START)
        assertEquals("\u001b[201~", KeyMapper.BRACKET_PASTE_END)
    }
}