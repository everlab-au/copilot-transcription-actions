// Permission request handler
document.addEventListener("DOMContentLoaded", () => {
  console.log("Permission request page loaded");

  const requestButton = document.getElementById("requestPermission");
  const statusElement = document.getElementById("permissionStatus");
  const closeButton = document.getElementById("closeTab");

  // Check if permission is already granted
  checkPermission();

  // Request permission button
  requestButton.addEventListener("click", async () => {
    try {
      await requestMicrophoneAccess();
    } catch (error) {
      showError(`Error requesting permission: ${error.message}`);
    }
  });

  // Close tab button
  closeButton.addEventListener("click", () => {
    window.close();
  });

  // Check current microphone permission status
  async function checkPermission() {
    try {
      // Try using the Permissions API (only available in secure contexts)
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({
            name: "microphone",
          });

          if (status.state === "granted") {
            showSuccess(
              "Microphone permission is already granted! You can close this tab."
            );
            notifyBackgroundGranted();
            return;
          } else if (status.state === "denied") {
            showError(
              "Microphone permission is denied. Please enable it in your browser settings."
            );
            return;
          }
        } catch (permError) {
          console.log("Permissions API not fully supported");
        }
      }

      // Alternative check: try to access the microphone directly
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());

        showSuccess(
          "Microphone permission is already granted! You can close this tab."
        );
        notifyBackgroundGranted();
      } catch (mediaError) {
        if (mediaError.name === "NotAllowedError") {
          showError(
            "Microphone access is currently blocked. Click the button to request access."
          );
        } else {
          showError(`Error accessing microphone: ${mediaError.message}`);
        }
      }
    } catch (error) {
      console.error("Error checking permission:", error);
    }
  }

  // Request microphone permission
  async function requestMicrophoneAccess() {
    try {
      statusElement.textContent = "Requesting microphone access...";
      statusElement.className = "status";

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Stop all tracks
      stream.getTracks().forEach((track) => track.stop());

      showSuccess("Microphone access granted successfully!");
      notifyBackgroundGranted();
    } catch (error) {
      console.error("Error requesting microphone access:", error);

      if (error.name === "NotAllowedError") {
        showError(
          "Microphone access was denied. Please try again or enable it in browser settings."
        );
        notifyBackgroundDenied("User denied permission");
      } else {
        showError(`Error accessing microphone: ${error.message}`);
        notifyBackgroundDenied(error.message);
      }
    }
  }

  // Notify the background script that permission was granted
  function notifyBackgroundGranted() {
    try {
      chrome.runtime.sendMessage({
        action: "permissionGranted",
        type: "microphone",
      });
    } catch (error) {
      console.error(
        "Error notifying background about granted permission:",
        error
      );
    }
  }

  // Notify the background script that permission was denied
  function notifyBackgroundDenied(error) {
    try {
      chrome.runtime.sendMessage({
        action: "permissionDenied",
        type: "microphone",
        error: error,
      });
    } catch (error) {
      console.error(
        "Error notifying background about denied permission:",
        error
      );
    }
  }

  // Display success message
  function showSuccess(message) {
    statusElement.textContent = message;
    statusElement.className = "status success";
  }

  // Display error message
  function showError(message) {
    statusElement.textContent = message;
    statusElement.className = "status error";
  }
});
