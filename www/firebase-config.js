// Firebase 설정 파일
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBfBMnPKGBqEPUg7bg5_ykdgC7yWfwE8QU",
  authDomain: "workout-608fa.firebaseapp.com",
  databaseURL: "https://workout-608fa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "workout-608fa",
  storageBucket: "workout-608fa.firebasestorage.app",
  messagingSenderId: "846866052805",
  appId: "1:846866052805:web:7179c06f05791a3af862ac",
  measurementId: "G-BCT63XVF1W"
};

// 설정 완료 여부 자동 확인
const IS_FIREBASE_CONFIGURED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && Boolean(FIREBASE_CONFIG.apiKey);
