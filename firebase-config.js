// Настройки синхронизации между устройствами (Firebase Realtime Database).
//
// Это НЕ секретные данные — доступ к самой базе данных ограничивается
// правилами Realtime Database (Rules), а не секретностью этого файла,
// поэтому конфиг можно спокойно хранить прямо в репозитории.
//
// Как заполнить — см. раздел «Синхронизация между устройствами» в README.md:
// 1. Создайте бесплатный проект на https://console.firebase.google.com
// 2. Включите Realtime Database
// 3. Project settings → General → Your apps → добавьте веб-приложение
// 4. Скопируйте значения из появившегося объекта firebaseConfig сюда
//
// Пока apiKey пустой — кнопка «Синхронизация» в меню сайта покажет,
// что синхронизация не настроена, но весь остальной сайт работает как обычно.
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
