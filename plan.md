# Copilot Transcription/Action Architecture

## Overview

This project aims to integrate real-time audio transcription with CopilotKit using the Model Context Protocol (MCP). The goal is to detect actionable moments in meetings and suggest actions via the CopilotKit chat UI, executing user-authorized tools through MCP.

## Tech Stack

- **Frontend**: CopilotKit (React)
- **Transcription**: PENDING
- **Action Detection**: CopilotKit handles this via Backend ACtions
- **Context Integration**: MCP (Open MCP Client / Server)
- **Backend API**: Node.js / Express

## Task List

- **Setup Transcription Service**: Select, implement and test transcription integration.
  - This transcription will happen separately to the CopilotKit implementation, but the output transcript will get fed into the action engine, and possible actions will be surfaced to the copilot
- **Integrate MCP Memory**: Ensure seamless data flow into MCP memory, and allow tools to be invoked from MCP
  - [Docs for  MCP from CopilotKit](https://docs.copilotkit.ai/guides/model-context-protocol)
- **Action Detection && Tool Calls**: Detect actions from text or transcription feeds and execute them - mostly handled by CopilotKit
  - [Backend Actions](https://docs.copilotkit.ai/guides/backend-actions/typescript-backend-actions)
- **UI Customization**: When an action is matched by CopilotKit, we should show this in the frontend and let the user accept or reject the action. If they accept, then we make the tool call - this should be handled by [CopilotChat](https://docs.copilotkit.ai/reference/components/chat/CopilotChat)