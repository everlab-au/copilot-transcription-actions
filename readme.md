# Copilot Transcription/Action Architecture

## Overview

This project aims to integrate real-time audio transcription with CopilotKit using the Model Context Protocol (MCP). The goal is to build a chrome extension detect actionable moments in meetings and suggest actions via the CopilotKit chat UI, executing user-authorized tools through MCP.

Your trial tasks are to implement both the MCP system and the transcription system.

[MCP Explainer](<https://medium.com/@elisowski/mcp-explained-the-new-standard-connecting-ai-to-everything-79c5a1c98288#:~:text=Model%20Context%20Protocol%20(MCP)%20is,or%20how%20they're%20built.>) - This doc is just a taster, I'd recommend doing some of your own research on the concept on day one if you aren't familiar. Expect to spend some time understanding the project and concepts involved.

## Tech Stack

- **Frontend**: CopilotKit (React)
- **Transcription**: Whisper
- **Context Integration & Action Detection**: MCP (Open MCP Client / Server)
- **Backend API**: Node.js / Express

## Task List

### 0 - Chrome Extension Setup

- **WXT** Use [WXT](https://wxt.dev/) to setup a chrome extension that runs in a [sidepanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
  - Note: Some chromium browsers like Arc do not support the sidepanel API, I recommend using chrome

### 1 - MCP

We want to implement a rudimentary MCP. The only tool we need now is a scheduler, and this is just a proof of concept.

- **Integrate MCP Memory**: Ensure seamless data flow into MCP memory, and allow tools to be invoked from MCP
  - [Docs for MCP from CopilotKit](https://docs.copilotkit.ai/guides/model-context-protocol)
- **Example Tool Call (Scheduler)**: Create an example tool call
  - Create a scheduling tool/action that logs out the time desired for an appointment, the tool does not need to take any other actions of its own at this point
  - The copilot should listen to the context and suggest this action if the user says "book in at 4pm" or similar
- **UI Customization**: When an action is suggested by MCP, we should show this in the frontend and let the user accept or reject the action. If they accept, then we make the tool call - this should be handled by [CopilotChat](https://docs.copilotkit.ai/reference/components/chat/CopilotChat)

### 2 - Transcription

We want to transcribe audio from a meet call. We will then feed that output into our MCP, so it can be analysed for potential action items.

- **Capture Audio**: Capture audio from the user and the other person on the call
  - [tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture/) should let you capture the other person's audio
  - [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) should let you capture the user's microphone audio
- **Setup Transcription Service**: Select, implement and test transcription integration.
  - This transcription will happen separately to the CopilotKit implementation
  - The transcription must be realtime and run locally (not via an api)
- **Feed output into MCP**
  - The output transcript will get fed into the action engine, and possible actions will be surfaced to the copilot
- The transcription should be viewable in the chrome extension separately to the chat UI (I suggest a tab interface)

To start on this, I suggest looking [here](https://www.reddit.com/r/LocalLLaMA/comments/1ftlznt/openais_new_whisper_turbo_model_running_100/) - this implementation seems pretty close to what we would want for the transcription segment, the additional work would be to use realtime audio (in chunks).
