import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCPn0kMMrx4tRW1XJfrTenqPB08XzAc1x0",
  authDomain: "aibotvr1.firebaseapp.com",
  projectId: "aibotvr1",
  storageBucket: "aibotvr1.firebasestorage.app",
  messagingSenderId: "524453697028",
  appId: "1:524453697028:web:08d175b825238dbf590751"
}

const firebaseApp = initializeApp(firebaseConfig)
const auth = getAuth(firebaseApp)

const root = createRoot(document.getElementById('root'))

root.render(
  <div style={{
    display:'flex', alignItems:'center', justifyContent:'center',
    height:'100vh', background:'#000', color:'#fff',
    fontFamily:'system-ui', fontSize:'18px', gap:'12px'
  }}>
    <span style={{ fontSize:28 }}>🧠</span> Verificando acceso...
  </div>
)

async function init() {
  const params = new URLSearchParams(window.location.search)
  const customToken = params.get('token')

  if (customToken) {
    // Limpiar token de la URL
    window.history.replaceState({}, document.title, window.location.pathname)
    try {
      await signInWithCustomToken(auth, customToken)
    } catch(e) {
      console.warn('Error con custom token:', e.message)
      window.location.replace('https://iapprende.com')
      return
    }
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      )
    } else {
      window.location.replace('https://iapprende.com')
    }
  })
}

init()
