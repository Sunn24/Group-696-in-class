const firebaseConfig = {
  apiKey: "AIzaSyDn75-Sw8vYTd152jw-h98ozqUHVPJBeyQ",
  authDomain: "group-696.firebaseapp.com",
  projectId: "group-696",
  storageBucket: "group-696.firebasestorage.app",
  messagingSenderId: "1043903244931",
  appId: "1:1043903244931:web:bc0be155fa1b0b7c3709b6"
};
 
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
 
// เก็บผลลัพธ์การจัดกลุ่มไว้ที่ path นี้ในฐานข้อมูล
// (เปลี่ยนชื่อ path ได้ถ้าต้องการใช้ฐานข้อมูลเดียวกันกับหลายวิชา/หลายบอร์ด)
const assignmentsRef = db.ref('cpe2104696_group_assignments');
