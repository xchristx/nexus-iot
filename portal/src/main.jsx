import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './estilos.css'
import { iniciarTema } from './tema.js'

// Antes de dibujar nada: así no se ve un instante el tema de siempre.
iniciarTema()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
