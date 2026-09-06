/**
 * Custom toast wrapper with sound support
 */

import { toast as sonnerToast } from 'sonner';
import { playNotificationSound } from './notificationSound';

type ToastOptions = Parameters<typeof sonnerToast.success>[1];

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    playNotificationSound();
    return sonnerToast.success(message, options);
  },

  error: (message: string, options?: ToastOptions) => {
    playNotificationSound();
    return sonnerToast.error(message, options);
  },

  info: (message: string, options?: ToastOptions) => {
    playNotificationSound();
    return sonnerToast.info(message, options);
  },

  warning: (message: string, options?: ToastOptions) => {
    playNotificationSound();
    return sonnerToast.warning(message, options);
  },

  // Silent toast without sound
  silent: {
    success: (message: string, options?: ToastOptions) => {
      return sonnerToast.success(message, options);
    },
    error: (message: string, options?: ToastOptions) => {
      return sonnerToast.error(message, options);
    },
    info: (message: string, options?: ToastOptions) => {
      return sonnerToast.info(message, options);
    },
    warning: (message: string, options?: ToastOptions) => {
      return sonnerToast.warning(message, options);
    },
  },

  // Re-export other toast methods
  custom: sonnerToast.custom,
  message: sonnerToast.message,
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
  loading: sonnerToast.loading,
};
