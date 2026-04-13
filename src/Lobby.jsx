import React from 'react';
import './Lobby.css';
import { disciplinas } from './disciplinasData';

// Este componente recibe una función 'onSeleccionar' del padre (App.jsx)
const Lobby = ({ onSeleccionar }) => {
  return (
    <div className="lobby-container">
      <header className="lobby-header">
        <h1 className="lobby-title">NEXUS ACADEMY</h1>
        <p className="lobby-subtitle">Selecciona tu disciplina y sincroniza tu avatar</p>
      </header>

      <div className="disciplinas-grid">
        {disciplinas.map((materia) => (
          <div 
            key={materia.id}
            className="disciplina-card"
            // Inyectamos el color del tema en una variable CSS para que el hover funcione
            style={{ '--tema-color': materia.colorTema }}
            onClick={() => onSeleccionar(materia.id)}
          >
            <div className="card-header">
              <span className="card-icono">{materia.icono}</span>
              <span className="card-avatars-badge">
                 {materia.avataresDisponibles} AVATARES
              </span>
            </div>
            <div>
              <h3 className="card-titulo">{materia.titulo}</h3>
              <p className="card-subtitulo">{materia.subtitulo}</p>
            </div>
            <p className="card-descripcion">{materia.descripcion}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Lobby;