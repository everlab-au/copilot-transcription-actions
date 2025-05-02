import { useState } from "react";
import {
  requestMicrophonePermission,
  checkMicrophonePermission,
} from "../utils/permissionUtils";

export default function PermissionTest() {
  const [status, setStatus] = useState<string>("Not checked");
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [hasError, setHasError] = useState<string | null>(null);

  const checkPermission = async () => {
    setStatus("Checking...");
    setHasError(null);

    try {
      const isGranted = await checkMicrophonePermission();
      setStatus(isGranted ? "Granted" : "Not granted or unknown");
    } catch (error) {
      console.error("Error checking permission:", error);
      setStatus("Error checking");
      setHasError(String(error));
    }
  };

  const requestPermission = async () => {
    setIsRequesting(true);
    setHasError(null);
    setStatus("Requesting...");

    try {
      await requestMicrophonePermission();
      setStatus("Permission granted!");
    } catch (error) {
      console.error("Error requesting permission:", error);
      setStatus("Permission denied or error");
      setHasError(String(error));
    } finally {
      setIsRequesting(false);
    }
  };

  // Direct getUserMedia test
  const testMicrophone = async () => {
    setStatus("Testing microphone directly...");
    setHasError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus("Microphone access successful!");

      // Stop all tracks
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setStatus("Microphone access failed");
      setHasError(String(error));
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-lg font-medium mb-3">Microphone Permission Test</h2>

      <div className="flex flex-col space-y-4">
        <div className="p-3 bg-gray-100 rounded">
          <div className="text-sm font-medium">Current Status:</div>
          <div
            className={`text-lg ${
              status.includes("Granted") || status.includes("successful")
                ? "text-green-600"
                : "text-gray-700"
            }`}
          >
            {status}
          </div>
          {hasError && (
            <div className="mt-1 text-xs text-red-500 overflow-hidden overflow-ellipsis">
              Error: {hasError}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={checkPermission}
            className="py-2 px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-sm font-medium"
          >
            Check Permission
          </button>

          <button
            onClick={requestPermission}
            disabled={isRequesting}
            className="py-2 px-4 bg-green-100 hover:bg-green-200 text-green-700 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {isRequesting ? "Requesting..." : "Request Permission (iframe)"}
          </button>

          <button
            onClick={testMicrophone}
            className="py-2 px-4 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md text-sm font-medium"
          >
            Test Microphone Directly
          </button>
        </div>

        <div className="text-xs text-gray-500 mt-2">
          <p>
            This test validates microphone permission access in the extension.
          </p>
          <p>
            If "Test Microphone Directly" works but the iframe method doesn't,
            there's a Chrome extension context limitation.
          </p>
        </div>
      </div>
    </div>
  );
}
