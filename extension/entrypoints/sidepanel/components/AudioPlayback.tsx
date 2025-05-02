import { useEffect, useState, useRef } from "react";

// Chrome API declaration
declare const chrome: {
  runtime: {
    sendMessage: (message: any, callback?: (response: any) => void) => void;
    onMessage: {
      addListener: (
        callback: (request: any, sender: any, sendResponse: any) => void
      ) => void;
      removeListener: (
        callback: (request: any, sender: any, sendResponse: any) => void
      ) => void;
    };
  };
};

// Recording type
interface Recording {
  id: string;
  timestamp: number;
  duration: number;
  audioURL?: string;
}

const AudioPlayback = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    console.log("AudioPlayback: Initializing component");

    // Request recordings list from offscreen document
    chrome.runtime.sendMessage(
      {
        message: {
          type: "GET_RECORDINGS",
          target: "offscreen",
        },
      },
      (response: any) => {
        console.log(
          "AudioPlayback: Received GET_RECORDINGS response:",
          response
        );

        if (
          response &&
          response.message &&
          response.message.type === "RECORDINGS_LIST"
        ) {
          console.log(
            "AudioPlayback: Setting recordings:",
            response.message.recordings
          );
          setRecordings(response.message.recordings || []);
        } else {
          console.warn(
            "AudioPlayback: Invalid response format for recordings:",
            response
          );
        }
        setIsLoading(false);
      }
    );

    // Listen for new recordings
    const handleMessages = (request: any) => {
      console.log("AudioPlayback: Received message:", request);

      if (!request.message) return;

      switch (request.message.type) {
        case "NEW_RECORDING_AVAILABLE":
          console.log(
            "AudioPlayback: New recording available:",
            request.message
          );
          // Add the new recording to the list
          setRecordings((prev) => [
            ...prev,
            {
              id: request.message.recordingId,
              timestamp: request.message.timestamp,
              duration: request.message.duration || 0,
            },
          ]);
          break;
        case "RECORDING_PLAYBACK":
          console.log(
            "AudioPlayback: Recording playback received:",
            request.message
          );
          // Start playback when we receive a blob URL
          if (request.message.audioURL && audioRef.current) {
            audioRef.current.src = request.message.audioURL;
            audioRef.current.play().catch((err) => {
              console.error("AudioPlayback: Error playing audio:", err);
            });
            setCurrentPlayingId(request.message.recordingId);
          }
          break;
      }
    };

    // Add message listener
    chrome.runtime.onMessage.addListener(handleMessages);

    return () => {
      // Remove message listener when component unmounts
      chrome.runtime.onMessage.removeListener(handleMessages);
    };
  }, []);

  const handlePlay = (recordingId: string) => {
    console.log(
      "AudioPlayback: Requesting playback for recording:",
      recordingId
    );
    // Request playback from offscreen document
    chrome.runtime.sendMessage({
      message: {
        type: "PLAY_RECORDING",
        target: "offscreen",
        recordingId: recordingId,
      },
    });
  };

  const handleClearRecordings = () => {
    console.log("AudioPlayback: Clearing all recordings");
    // Request to clear all recordings
    chrome.runtime.sendMessage(
      {
        message: {
          type: "DELETE_RECORDINGS",
          target: "offscreen",
        },
      },
      () => {
        setRecordings([]);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        setCurrentPlayingId(null);
      }
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="w-full mt-4 bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-medium">Recorded Audio</h3>
        {recordings.length > 0 && (
          <button
            onClick={handleClearRecordings}
            className="px-3 py-1 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-md"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Hidden audio player */}
      <audio
        ref={audioRef}
        onEnded={() => setCurrentPlayingId(null)}
        className="w-full mb-3"
        controls
      />

      {isLoading ? (
        <div className="text-center py-4 text-gray-500">
          Loading recordings...
        </div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          No recordings available. Start transcribing to create recordings.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <ul className="divide-y divide-gray-200">
            {recordings.map((recording) => (
              <li key={recording.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Recording {formatTimestamp(recording.timestamp)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Duration: {formatDuration(recording.duration)}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePlay(recording.id)}
                    className={`${
                      currentPlayingId === recording.id
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    } p-2 rounded-full`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      {currentPlayingId === recording.id ? (
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 5a1 1 0 112 0v4a1 1 0 01-1 1H6a1 1 0 110-2h2V5zm3 5a1 1 0 100 2h2a1 1 0 100-2h-2z"
                          clipRule="evenodd"
                        />
                      ) : (
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                          clipRule="evenodd"
                        />
                      )}
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AudioPlayback;
