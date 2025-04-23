# Copilot Transcription/Action Architecture

## Overview

This project aims to integrate real-time audio transcription with CopilotKit using the Model Context Protocol (MCP). The goal is to detect actionable moments in meetings and suggest actions via the CopilotKit chat UI, executing user-authorized tools through MCP.

[MCP Explainer](https://medium.com/@elisowski/mcp-explained-the-new-standard-connecting-ai-to-everything-79c5a1c98288#:~:text=Model%20Context%20Protocol%20(MCP)%20is,or%20how%20they're%20built.) - This doc is just a taster, I'd recommend doing some of your own research on the concept on day one if you aren't familiar. Expect to spend some time understanding the project and concepts involved.

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

## Task List - MCP
We want to implement a rudimentary MCP. The only tool we need now is a scheduler, and this is just a proof of concept.

- **Integrate MCP Memory**: Ensure seamless data flow into MCP memory, and allow tools to be invoked from MCP
  - [Docs for  MCP from CopilotKit](https://docs.copilotkit.ai/guides/model-context-protocol)
- **Action Detection & Tool Calls**: Detect actions from text or transcription feeds and execute them - mostly handled by CopilotKit in Backend Actions
  - [Backend Actions](https://docs.copilotkit.ai/guides/backend-actions/typescript-backend-actions)
- **Example Tool Call (Scheduler)**: Create an example tool call
  - Create a scheduling tool/action that logs out the time desired for an appointment, the tool does not need to take any other actions of its own at this point
  - The copilot should listen to the context and suggest this action if the user says "book in at 4pm" or similar
- **UI Customization**: When an action is matched by CopilotKit, we should show this in the frontend and let the user accept or reject the action. If they accept, then we make the tool call - this should be handled by [CopilotChat](https://docs.copilotkit.ai/reference/components/chat/CopilotChat)