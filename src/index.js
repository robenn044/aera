import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ControlPanel from './ControlPanel';

const root = ReactDOM.createRoot(document.getElementById('root'));
const isControlRoute = typeof window !== 'undefined'
  && window.location?.pathname?.toLowerCase().startsWith('/control');
root.render(isControlRoute ? <ControlPanel /> : <App />);

// Perf logging removed to keep bundle lean.
