# Copilot Transcription/Action Architecture

## Overview

This project aims to integrate real-time audio transcription with CopilotKit using the Model Context Protocol (MCP). The goal is to detect actionable moments in meetings and suggest actions via the CopilotKit chat UI, executing user-authorized tools through MCP.

Your trial task is to implement the transcription system.

[MCP Explainer](<https://medium.com/@elisowski/mcp-explained-the-new-standard-connecting-ai-to-everything-79c5a1c98288#:~:text=Model%20Context%20Protocol%20(MCP)%20is,or%20how%20they're%20built.>) - This doc is just a taster, I'd recommend doing some of your own research on the concept on day one if you aren't familiar. Expect to spend some time understanding the project and concepts involved.

## Tech Stack

- **Frontend**: CopilotKit (React)
- **Transcription**: PENDING
- **Action Detection**: CopilotKit handles this via Backend ACtions
- **Context Integration**: MCP (Open MCP Client / Server)
- **Backend API**: Node.js / Express

## Task List - Transcription

We want to transcribe audio from a meet call. We will then feed that output into our MCP, so it can be analysed for potential action items.

- **Setup Transcription Service**: Select, implement and test transcription integration.
  - This transcription will happen separately to the CopilotKit implementation,
- **Feed output into MCP**
  - The output transcript will get fed into the action engine, and possible actions will be surfaced to the copilot
