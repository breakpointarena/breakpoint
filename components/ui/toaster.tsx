'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        style: {
          background: '#121212',
          color: '#ffffff',
          border: '1px solid #27272a',
          opacity: 1,
        },
        className: 'toast-item',
        descriptionClassName: 'toast-description',
      }}
      style={{
        zIndex: 99999,
      }}
      // Ensure proper visibility settings
      visibleToasts={9}
      expand={true}
      gap={12}
    />
  )
}
