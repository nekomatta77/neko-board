// Используем CDN ссылки, так как в Acode нет npm-сборщика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove, child, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Твои настройки (я вставил их сюда)
const firebaseConfig = {
  apiKey: "AIzaSyC5E-bN2LNWElo7I4kcCGqcgMvoy8WX4wY",
  authDomain: "neko-board.firebaseapp.com",
  databaseURL: "https://neko-board-default-rtdb.firebaseio.com",
  projectId: "neko-board",
  storageBucket: "neko-board.firebasestorage.app",
  messagingSenderId: "758590553576",
  appId: "1:758590553576:web:b3d006e91390d1d4f3385d",
  measurementId: "G-G9X92RCNM4"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Экспортируем методы базы данных, чтобы использовать их в app.js
export { db, ref, set, push, onValue, update, remove, child, get };
