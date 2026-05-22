import React from 'react'
import ReactDOM from 'react-dom/client'
import Popup from './popup/Popup'
import { ThemeProvider } from './context/ThemeContext'
import './styles/theme.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <Popup />
    </ThemeProvider>
  </React.StrictMode>,
)
