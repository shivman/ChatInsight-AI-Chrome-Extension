# ChatInsight AI Chrome Extension

A Chrome Extension that provides real-time insights from Telegram Web and WhatsApp Web chats using Google's Gemini 2.0 Flash LLM.

## Features

- Real-time chat message monitoring for Telegram Web and WhatsApp Web
- Integration with Google's Gemini 2.0 Flash LLM for chat analysis
- Multi-turn conversation memory
- Clean and intuitive user interface
- Secure API key management

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Setup

1. Get a Gemini API key from the [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click the ChatInsight AI extension icon in Chrome
3. Click the settings icon and enter your Gemini API key
4. The extension is now ready to use!

## Usage

1. Open either Telegram Web or WhatsApp Web in Chrome
2. Navigate to a chat conversation
3. Click the ChatInsight AI extension icon
4. Enter your question or analysis prompt in the text area
5. Click "Generate Insight" to get AI-powered analysis of the chat

## Examples

Here are some example prompts you can try:
- "Summarize the main topics discussed in the last hour"
- "What are the key action items mentioned in this conversation?"
- "Analyze the sentiment of the conversation"
- "Extract important dates and deadlines mentioned"

## Technical Details

- Built with Manifest V3
- Uses MutationObserver for real-time chat monitoring
- Implements secure message passing between content scripts and background service
- Maintains conversation history with size limits for optimal performance
- Handles API rate limiting and error cases

## Privacy & Security

- All chat processing is done locally
- Only processes visible messages in the current chat
- API keys are stored securely in Chrome's local storage
- No data is sent to external servers except the Gemini API

## Development

To modify or extend the extension:

1. Make your changes to the source code
2. Reload the extension in `chrome://extensions/`
3. Test your changes with both Telegram Web and WhatsApp Web

## Files Structure

```
├── manifest.json           # Extension configuration
├── popup.html             # Extension popup UI
├── popup.js               # Popup interaction logic
├── background.js          # Background service worker
├── content-scripts/
│   ├── telegram-observer.js   # Telegram Web message observer
│   └── whatsapp-observer.js   # WhatsApp Web message observer
└── assets/
    ├── icon16.png        # Extension icons
    ├── icon48.png
    └── icon128.png
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
