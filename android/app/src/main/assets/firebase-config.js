// Firebase 설정 파일
// https://console.firebase.google.com 에서 프로젝트 생성 후
// 프로젝트 설정 > 내 앱 (웹 </>) 에서 발급받은 firebaseConfig 값을 아래에 붙여넣으세요.

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 설정 완료 여부 자동 확인
const IS_FIREBASE_CONFIGURED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && Boolean(FIREBASE_CONFIG.apiKey);
