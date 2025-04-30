# Getting Started

This project consists of two main components: a Chrome extension and a backend server. Below are instructions on how to run both components.

## Running the Server

The server handles the MCP (Model Context Protocol) interactions and provides an API for the extension.

```bash
# Navigate to the server directory
cd server

# Install dependencies (first time only)
npm install

# Start the server
npm run dev
```

The server will start on http://localhost:4000.

## Running the Extension

The Chrome extension provides the UI and handles the audio transcription.

```bash
# Navigate to the extension directory
cd extension

# Install dependencies (first time only)
npm install

# Start the extension in development mode
npm run dev
```

This will build the extension and set up a watch process for development.

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `.output/chrome-mv3-dev` directory in your project
4. The extension should now be available in your Chrome browser

## Usage Notes

- Currently, the direct recording feature is disabled - please use the upload or URL options for audio
- The extension needs both components (server and extension) running to function properly
- For best results, ensure the server is started before using the extension

## Troubleshooting

- If you encounter connection issues, ensure the server is running on port 4000
- Check the browser console for detailed error messages
- Make sure you've granted the necessary permissions for the extension
