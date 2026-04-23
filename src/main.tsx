import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './debug/logs';
import App from './App';
import './app.css';
import './glasses-main';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
