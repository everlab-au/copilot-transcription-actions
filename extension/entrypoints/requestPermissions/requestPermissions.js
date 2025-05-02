/**
 * Requests user permission for microphone access and sends a message to the parent window.
 */
function getUserPermission() {
  console.info("Getting user permission for microphone access...");

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      console.log("Microphone access granted");

      // Stop all tracks immediately
      stream.getTracks().forEach((track) => track.stop());

      // Post a message to the parent window indicating successful permission
      window.parent.postMessage({ type: "permissionsGranted" }, "*");
    })
    .catch((error) => {
      console.warn("Error requesting microphone permission: ", error);
      if (error.message === "Permission denied") {
        // Show an alert if permission is denied
        window.alert(
          "Please allow microphone access. This extension uses your microphone to transcribe audio during meetings."
        );
      }

      // Post a message to the parent window indicating failed permission with an optional error message
      window.parent.postMessage(
        {
          type: "permissionsFailed",
          message: error.message,
        },
        "*"
      );
    });
}

// Call the function to request microphone permission when the page loads
window.addEventListener("DOMContentLoaded", getUserPermission);
