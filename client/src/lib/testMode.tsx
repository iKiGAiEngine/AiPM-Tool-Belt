import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface TestModeContextType {
  isTestMode: boolean;
  toggleTestMode: () => void;
}

const TestModeContext = createContext<TestModeContextType>({
  isTestMode: false,
  toggleTestMode: () => {},
});

const STORAGE_KEY = "aipm-test-mode";

export function TestModeProvider({ children }: { children: ReactNode }) {
  const [isTestMode, setIsTestMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isTestMode));
    } catch {}
  }, [isTestMode]);

  const toggleTestMode = useCallback(() => {
    setIsTestMode((prev) => !prev);
  }, []);

  return (
    <TestModeContext.Provider value={{ isTestMode, toggleTestMode }}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  return useContext(TestModeContext);
}
