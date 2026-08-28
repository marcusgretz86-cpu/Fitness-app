import React, { createContext, useContext, useEffect, useState } from "react";
import { initIdentity, getCurrentUser, onAuthChange, logout as logoutHelper } from "../lib/netlifyAuth.js";

const AuthContext = createContext({ user: null, loading: true, signOut: async () => {} });

// Netlify Identity's user object shape differs from Supabase's -- normalize
// to the same { id, email } shape the rest of the app expects, so
// components don't need to know which backend is behind them.
function normalize(nlUser) {
  if (!nlUser) return null;
  return { id: nlUser.id || nlUser.sub, email: nlUser.email, raw: nlUser };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initIdentity();
    setUser(normalize(getCurrentUser()));
    setLoading(false);

    const unsubscribe = onAuthChange(
      (nlUser) => setUser(normalize(nlUser)),
      () => setUser(null)
    );
    return unsubscribe;
  }, []);

  const signOut = async () => {
    await logoutHelper();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
