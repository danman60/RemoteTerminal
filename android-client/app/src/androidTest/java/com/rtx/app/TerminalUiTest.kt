package com.rtx.app

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rtx.app.ui.TerminalScreen
import com.rtx.app.ui.theme.RemoteTerminalSyncTheme
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TerminalUiTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setup() {
        composeTestRule.setContent {
            RemoteTerminalSyncTheme {
                TerminalScreen()
            }
        }
    }

    @Test
    fun terminalScreen_isDisplayed() {
        // Check that main UI elements are present
        composeTestRule.onNodeWithText("Connect").assertIsDisplayed()
        composeTestRule.onNodeWithText("Disconnected").assertIsDisplayed()
    }

    @Test
    fun connectionButton_clickable() {
        // Test connection button is clickable when disconnected
        composeTestRule.onNodeWithText("Connect")
            .assertIsDisplayed()
            .assertHasClickAction()
    }

    @Test
    fun inputField_isDisplayed() {
        // Check input field is present
        composeTestRule.onNodeWithText("Type command and press Enter")
            .assertIsDisplayed()
    }

    @Test
    fun navigationKeys_areDisplayed() {
        // Check navigation keys are present
        composeTestRule.onNodeWithText("↑").assertIsDisplayed()
        composeTestRule.onNodeWithText("↓").assertIsDisplayed()
        composeTestRule.onNodeWithText("←").assertIsDisplayed()
        composeTestRule.onNodeWithText("→").assertIsDisplayed()
        composeTestRule.onNodeWithText("Ctrl").assertIsDisplayed()
        composeTestRule.onNodeWithText("Esc").assertIsDisplayed()
    }

    @Test
    fun inputField_acceptsText() {
        // Test typing in input field
        composeTestRule.onNodeWithText("Type command and press Enter")
            .performTextInput("test command")

        // Verify text was entered (this would need the actual input field to be testable)
    }

    @Test
    fun voiceInputButton_isPresent() {
        // Check voice input button is present
        composeTestRule.onNodeWithContentDescription("Voice Input")
            .assertIsDisplayed()
    }

    @Test
    fun sendButton_isPresent() {
        // Check send button is present
        composeTestRule.onNodeWithContentDescription("Send")
            .assertIsDisplayed()
    }

    @Test
    fun navigationKeys_areClickable() {
        // Test that navigation keys are clickable
        composeTestRule.onNodeWithText("↑")
            .assertHasClickAction()

        composeTestRule.onNodeWithText("Ctrl")
            .assertHasClickAction()

        composeTestRule.onNodeWithText("Esc")
            .assertHasClickAction()
    }

    @Test
    fun terminalOutput_scrollable() {
        // The terminal output should be in a scrollable container
        // This test verifies the LazyColumn is present
        composeTestRule.onAllNodesWithTag("terminal_output")
            .assertCountEquals(1)
    }

    @Test
    fun connectionStatus_showsCorrectState() {
        // Initially should show disconnected state
        composeTestRule.onNodeWithText("Disconnected").assertIsDisplayed()

        // Connection status should show appropriate icon
        composeTestRule.onNodeWithContentDescription("Connection Status")
            .assertExists()
    }
}