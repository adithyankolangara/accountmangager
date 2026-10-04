import { createContext, useContext } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

export interface ToastApi {
  show: (message: string, options?: { tone?: Toast['tone']; action?: Toast['action'] }) => void;
}

export const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}
