import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);

  const showToast = useCallback((text) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
