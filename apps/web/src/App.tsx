import { useCallback, useState } from "react";

import { ChatView } from "./components/ChatView";
import { LoginForm } from "./components/LoginForm";
import { login } from "./lib/api";
import { getStoredToken, storeToken } from "./lib/auth";

export default function App() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  const handleLogin = useCallback(async (username: string) => {
    const result = await login(username);
    storeToken(result.token);
    setToken(result.token);
  }, []);

  const handleSignedOut = useCallback(() => {
    setToken(null);
  }, []);

  return <div className="app-shell">{token ? <ChatView token={token} onSignedOut={handleSignedOut} /> : <LoginForm onSubmit={handleLogin} />}</div>;
}
