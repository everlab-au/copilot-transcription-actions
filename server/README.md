# Meeting Assistant MCP Server

This is the backend server for the Meeting Assistant Chrome extension. It implements the Model Context Protocol (MCP) to enable AI assistants to perform actions based on transcription data.

## Features

- **MCP Implementation**: Provides endpoints for CopilotKit integration
- **Scheduling Tool**: Detects and processes scheduling requests
- **Transcription Processing**: Handles incoming transcription data

## Setup Instructions

### Prerequisites

- Node.js (v16+)

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the server directory:

```bash
touch .env
```

Add your Anthropic API key to the `.env` file:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### Running the Server

```bash
npm run dev
```

This will start the server on http://localhost:4000.

## API Endpoints

- **POST /copilotkit**: Main endpoint for CopilotKit MCP communication
- **POST /transcription**: Endpoint for receiving transcription data

## Development Notes

- The server uses Express.js for API endpoints
- CopilotKit is integrated for AI assistant functionality
- Tools are registered under `/services/mcp/tools`

## Troubleshooting

- If you encounter CORS errors, ensure the client origin is properly configured
- Check server logs for detailed error messages
- Verify that your API keys are correctly set in the `.env` file

## License

MIT
