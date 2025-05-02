// Declare defineContentScript for TypeScript
declare const defineContentScript: (options: {
  matches: string[];
  main: () => void;
}) => void;

// Declare chrome runtime API for TypeScript
declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (
        callback: (
          request: any,
          sender: any,
          sendResponse: (response?: any) => void
        ) => boolean | void
      ) => void;
    };
    sendMessage: (message: any, callback?: (response: any) => void) => void;
    getURL: (path: string) => string;
  };
};

// Also declare browser API for TypeScript
declare const browser: {
  runtime: {
    onMessage: {
      addListener: (
        callback: (
          message: any,
          sender: any,
          sendResponse: (response?: any) => void
        ) => void
      ) => void;
    };
  };
};

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script initialized");

    // Create an audio context to analyze tab audio
    let audioContext: AudioContext | null = null;
    let mediaStream: MediaStream | null = null;

    // Function to detect audio playing on the page
    const detectAudioPlaying = () => {
      // Find all audio and video elements on the page
      const audioElements = Array.from(
        document.querySelectorAll("audio, video")
      );

      // Check which ones are playing
      const playingElements = audioElements.filter((el) => {
        const element = el as HTMLMediaElement;
        return !element.paused && !element.muted && element.volume > 0;
      });

      return {
        total: audioElements.length,
        playing: playingElements.length,
        hasAudio: playingElements.length > 0,
        audioDetails: audioElements.map((el) => {
          const element = el as HTMLMediaElement;
          return {
            playing: !element.paused,
            muted: element.muted,
            volume: element.volume,
            duration: element.duration,
            currentTime: element.currentTime,
            src: element.src || "embedded",
          };
        }),
      };
    };

    // Function to prepare the tab for audio capture
    const prepareTabForCapture = () => {
      // Create a small indicator that the tab is being prepared for capture
      const indicator = document.createElement("div");
      indicator.style.position = "fixed";
      indicator.style.top = "0";
      indicator.style.right = "0";
      indicator.style.backgroundColor = "rgba(0, 128, 255, 0.7)";
      indicator.style.color = "white";
      indicator.style.padding = "5px 10px";
      indicator.style.borderRadius = "0 0 0 5px";
      indicator.style.zIndex = "9999";
      indicator.style.fontSize = "12px";
      indicator.textContent = "Preparing for audio capture...";

      document.body.appendChild(indicator);

      // Remove the indicator after a short delay
      setTimeout(() => {
        if (document.body.contains(indicator)) {
          document.body.removeChild(indicator);
        }
      }, 3000);

      // Touch some audio elements to ensure they're active
      const mediaElements = document.querySelectorAll("audio, video");
      mediaElements.forEach((element) => {
        // Just accessing these properties can help ensure the element is ready
        // for external access without modifying its state
        const el = element as HTMLMediaElement;
        const isPlaying = !el.paused;
        const volume = el.volume;
        const muted = el.muted;
      });

      return {
        success: true,
        message: "Tab prepared for audio capture",
        audioElements: mediaElements.length,
      };
    };

    // Listen for messages from the background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getTabInfo") {
        // Send back information about the current tab
        sendResponse({
          title: document.title,
          url: window.location.href,
        });
        return true;
      }

      if (message.action === "prepareForCapture") {
        try {
          const result = prepareTabForCapture();
          sendResponse(result);
        } catch (error) {
          console.error("Error preparing tab for capture:", error);
          sendResponse({
            success: false,
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
        return true;
      }

      if (message.action === "captureTabAudio") {
        try {
          // Check if there's audio playing in the tab
          const audioInfo = detectAudioPlaying();

          if (audioInfo.hasAudio) {
            // Report back that we found audio elements
            sendResponse({
              success: true,
              audioInfo,
            });
          } else {
            sendResponse({
              success: false,
              audioInfo,
              message:
                "No audio or video elements currently playing in the tab",
            });
          }
        } catch (error) {
          console.error("Error capturing tab audio:", error);
          sendResponse({
            success: false,
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
        return true;
      }

      if (message.action === "checkAudioPlaying") {
        try {
          const audioInfo = detectAudioPlaying();
          sendResponse({
            success: true,
            audioInfo,
          });
        } catch (error) {
          console.error("Error checking audio playing:", error);
          sendResponse({
            success: false,
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
        return true;
      }
    });
  },
});
