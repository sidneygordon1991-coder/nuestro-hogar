import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/00-tokens.css';
import '../styles/theme.css';
import './calculators.css';
import CalculatorsPage from './CalculatorsPage';

// Public page: no account, no Supabase client. It follows the device theme.
const media = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', media.matches ? '#0e1012' : '#f5f4ef');
};
applyTheme();
media.addEventListener('change', applyTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CalculatorsPage />
  </React.StrictMode>
);
