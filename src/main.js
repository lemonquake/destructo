import './styles.css';
import { Game } from './game/Game.js';

const game = new Game(document.querySelector('#game-canvas'));
game.boot();
if (import.meta.env.DEV) {
  window.destructo = game;
  if (new URLSearchParams(location.search).get('stress') === '1') game.startPerformanceStressTest();
}
