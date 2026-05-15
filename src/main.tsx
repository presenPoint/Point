import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { syncHtmlLangFromStorage } from './store/localeStore';
import './index.css';

syncHtmlLangFromStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
