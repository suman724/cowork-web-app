import { useSessionStore } from "./stores/sessionStore";
import { SessionListView } from "./views/SessionList";
import { ConversationView } from "./views/Conversation";

const ACTIVE_STATUSES = [
  "SANDBOX_READY",
  "SESSION_RUNNING",
  "WAITING_FOR_LLM",
  "WAITING_FOR_TOOL",
];

export default function App() {
  const activeSession = useSessionStore((s) => s.activeSession);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {activeSession && ACTIVE_STATUSES.includes(activeSession.status) ? (
        <ConversationView />
      ) : (
        <SessionListView />
      )}
    </div>
  );
}
