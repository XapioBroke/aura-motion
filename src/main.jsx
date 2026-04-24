import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Firebase Auth Guard ──────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCPn0kMMrx4tRW1XJfrTenqPB08XzAc1x0",
  authDomain: "aibotvr1.firebaseapp.com",
  projectId: "aibotvr1",
  storageBucket: "aibotvr1.firebasestorage.app",
  messagingSenderId: "524453697028",
  appId: "1:524453697028:web:08d175b825238dbf590751"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

const root = createRoot(document.getElementById('root'))

// Muestra pantalla de carga mientras Firebase resuelve sesión
root.render(
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: '#000', color: '#fff',
    fontFamily: 'system-ui', fontSize: '18px', gap: '12px'
  }}>
    <span style={{ fontSize: 28 }}>🧠</span> Verificando acceso...
  </div>
)

onAuthStateChanged(auth, (user) => {
  if (user) {
    // ✅ Sesión activa → carga la app normal
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  } else {
    // 🔒 Sin sesión → regresa al landing
    window.location.replace('https://iapprende.com')
  }
})
