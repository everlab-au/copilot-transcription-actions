/**
 * Utility functions for managing microphone permissions in Chrome extensions
 */

// TypeScript declaration for Chrome API
declare const chrome: {
  runtime: {
    getURL: (path: string) => string;
  };
};

/**
 * Creates a modal-style iframe for requesting microphone permission
 * This works around Chrome's limitations with displaying permission prompts in extension contexts
 */
export const requestMicrophonePermission = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log("Creating permission request iframe");

    // Create overlay div for better visual presentation
    const overlay = document.createElement("div");
    overlay.id = "permission-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "99998";

    // Create the iframe frame with specific attributes to ensure microphone permission works
    const iframe = document.createElement("iframe");
    iframe.id = "mic-permission-iframe";
    iframe.style.width = "500px";
    iframe.style.height = "300px";
    iframe.style.border = "none";
    iframe.style.borderRadius = "8px";
    iframe.style.backgroundColor = "white";
    iframe.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    iframe.style.zIndex = "99999";

    // IMPORTANT: These attributes are crucial for permission prompts to work correctly
    iframe.setAttribute("allow", "microphone");
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    // Set the source to our permissions page
    iframe.src = chrome.runtime.getURL("requestPermissions/index.html");

    // Handle messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages coming from our iframe
      if (event.data && typeof event.data === "object") {
        if (event.data.type === "permissionGranted") {
          console.log("Permission granted via iframe");
          cleanup();
          resolve();
        } else if (event.data.type === "permissionDenied") {
          console.error("Permission denied via iframe:", event.data.error);
          cleanup();
          reject(new Error(event.data.error || "Permission denied"));
        }
      }
    };

    // Clean up function to remove elements and event listeners
    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };

    // Add the iframe to the overlay
    overlay.appendChild(iframe);

    // Set up message listener before adding the iframe to the DOM
    window.addEventListener("message", handleMessage);

    // Add to DOM
    document.body.appendChild(overlay);

    // Optional: Close on overlay click (outside the iframe)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        reject(new Error("Permission request canceled by user"));
      }
    });
  });
};

/**
 * Checks if microphone permission is already granted using multiple methods
 * Returns true only if the permission is definitively granted
 */
export const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    // First try permissions API
    const permissionResult = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    // If permission is already granted according to the Permissions API,
    // verify it works by actually accessing the microphone
    if (permissionResult.state === "granted") {
      try {
        // Try to actually access the microphone to confirm permission
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Stop the stream immediately
        stream.getTracks().forEach((track) => track.stop());

        console.log("Microphone permission is granted and working");
        return true;
      } catch (mediaError) {
        console.warn(
          "Permission appears granted but getUserMedia failed:",
          mediaError
        );
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking microphone permission:", error);
    return false;
  }
};
