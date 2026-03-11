import { useSessionStore } from "../stores/sessionStore";

export function SessionListView() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSession = useSessionStore((s) => s.activeSession);
  const loading = useSessionStore((s) => s.loading);
  const error = useSessionStore((s) => s.error);
  const createSession = useSessionStore((s) => s.createSession);
  const pollUntilReady = useSessionStore((s) => s.pollUntilReady);
  const clearError = useSessionStore((s) => s.clearError);

  const handleCreate = async () => {
    clearError();
    try {
      const sessionId = await createSession("default-tenant", "default-user");
      await pollUntilReady(sessionId);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const isProvisioning = activeSession?.status === "SANDBOX_PROVISIONING";

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md w-full p-8">
        <h1 className="text-3xl font-bold mb-8 text-center">Cowork</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        {isProvisioning ? (
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Starting sandbox...</p>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
          >
            {loading ? "Creating..." : "New Session"}
          </button>
        )}

        {sessions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              Recent Sessions
            </h2>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="p-3 bg-gray-900 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <span className="text-sm font-mono text-gray-400">
                      {s.sessionId.slice(0, 8)}...
                    </span>
                    <span className="ml-2 text-xs text-gray-600">
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
