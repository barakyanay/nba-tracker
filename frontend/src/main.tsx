import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './analytics.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error: unknown) => console.error('Unable to register the NBA Hub service worker.', error))
  }, { once: true })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
