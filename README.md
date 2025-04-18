# VoiceGPT Screen Reader

An AI-powered screen reader Chrome extension for visually impaired users that provides natural language interaction with web content.

## Overview

VoiceGPT Screen Reader transforms the traditional screen reading experience by allowing users to ask questions about webpage content in natural language and receive intelligent responses. Instead of having to linearly navigate through content, users can directly ask for specific information or request navigation to relevant sections.

## Features

- **Voice Command Interface**: Start/stop listening with voice commands or keyboard shortcuts
- **Natural Language Understanding**: Ask questions about the page in plain English
- **Intelligent Navigation**: Request navigation to specific parts of the page (headings, tables, links)
- **Context-Aware Responses**: Get summaries and explanations of page content
- **AI-Powered**: Uses Mistral AI for understanding and generating natural language responses
- **Local Fallback Mode**: Basic functionality works even without API connection
- **Customizable Voices**: Select from system voices and adjust speech rate

## Installation

### For Users

1. Download the extension files or clone this repository
2. Visit `chrome://extensions/` in your Chrome browser
3. Enable "Developer mode" (toggle in the upper right)
4. Click "Load unpacked" and select the extension directory
5. The VoiceGPT Screen Reader icon should now appear in your toolbar

### For Developers

1. Clone this repository
2. Install dependencies (none required for basic functionality)
3. Make changes to the code as needed
4. Test by loading the unpacked extension in Chrome

## Setup

1. Click on the VoiceGPT extension icon in your toolbar
2. Enter your Mistral AI API key in the settings
3. Select your preferred voice and speech rate
4. Click "Test API" to verify your connection
5. You're ready to go!

## Usage

### Basic Commands

- Click "Start Listening" or press Alt+Shift+V to begin voice input
- Speak your question or command clearly
- Listen to the response (press Alt+Shift+S to stop speech at any time)

### Example Commands

- "What is this page about?"
- "How many sections are on this page?"
- "Go to the section about [topic]"
- "Find the table with [description]"
- "Tell me about the images on this page"

### Keyboard Shortcuts

- `Alt+Shift+V`: Start/stop voice input
- `Alt+Shift+S`: Stop speech output

## How It Works

1. **Page Analysis**: The extension builds a semantic representation of the current webpage
2. **Voice Recognition**: Captures the user's spoken question using the Web Speech API
3. **Query Processing**: Determines if the query is a navigation command or information request
4. **AI Response**: For information requests, sends relevant page content to Mistral AI
5. **Speech Synthesis**: Converts the response to speech for the user

## API Integration

This extension uses the Mistral AI API for natural language understanding. You'll need:

1. A Mistral AI API key (get one at [Mistral AI's website](https://mistral.ai/))
2. Internet connectivity for API requests
3. Sufficient API credits for ongoing use

The extension includes fallback functionality for basic queries even without an API connection.

## Privacy & Data

- Voice processing happens locally using the Web Speech API
- Page content is only sent to Mistral AI when needed to answer queries
- No recordings or transcripts are stored beyond the current session
- API keys are stored locally in Chrome's secure storage

## Troubleshooting

### Common Issues

- **Extension not responding**: Try refreshing the page and reopening the extension
- **Voice recognition not working**: Check microphone permissions for Chrome
- **API errors**: Verify your API key and internet connection
- **No speech output**: Check if your system audio is working properly

### Debug Mode

For advanced troubleshooting:
1. Right-click the extension icon and select "Inspect popup"
2. Open the Console tab to view logs and error messages
3. Use the "Test API" button to check API connectivity

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request


## Acknowledgments

- Web Speech API for voice recognition and speech synthesis
- Mistral AI for natural language processing capabilities
- Chrome Extensions API for browser integration

---

Created to improve web accessibility for visually impaired users through AI-powered interaction.
