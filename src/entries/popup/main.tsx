import React from 'react';
import ReactDOM from 'react-dom/client';
import PopupApp from '../../popup/PopupApp';
import { ThemeProvider } from '../../popup/theme/ThemeContext';
import '../../popup/styles/theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <PopupApp />
    </ThemeProvider>
  </React.StrictMode>,
);
