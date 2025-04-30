import { useState, useEffect } from "react";

interface ConnectionStatus {
  isConnected: boolean;
  error: string | null;
  lastChecked: Date | null;
}

/**
 * Hook to check MCP server connection status
 * @param serverUrl The URL of the MCP server
 * @param checkInterval How often to check connection (in ms)
 * @returns ConnectionStatus object
 */
export function useMcpConnection(
  serverUrl: string,
  checkInterval: number = 30000
) {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    error: null,
    lastChecked: null,
  });

  const checkConnection = async () => {
    try {
      console.log(`Checking MCP server connection: ${serverUrl}`);
      const response = await fetch(serverUrl);

      const isConnected = response.ok;
      const newStatus = {
        isConnected,
        error: isConnected
          ? null
          : `Server responded with status ${response.status}`,
        lastChecked: new Date(),
      };

      console.log(`MCP server connection status:`, newStatus);
      setStatus(newStatus);

      return newStatus;
    } catch (error) {
      console.error("Error connecting to MCP server:", error);

      const newStatus = {
        isConnected: false,
        error: error instanceof Error ? error.message : String(error),
        lastChecked: new Date(),
      };

      setStatus(newStatus);
      return newStatus;
    }
  };

  // Check connection on mount and periodically
  useEffect(() => {
    // Check immediately
    checkConnection();

    // Then check periodically
    if (checkInterval > 0) {
      const interval = setInterval(checkConnection, checkInterval);
      return () => clearInterval(interval);
    }
  }, [serverUrl, checkInterval]);

  return {
    ...status,
    checkConnection,
  };
}

export default useMcpConnection;
