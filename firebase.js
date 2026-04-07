var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

let initialized = false;
let realtime_db;

function initFirebase() {
  if (!initialized) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: global.firebase_db_url
      });

      realtime_db = admin.database();
      initialized = true;
      return admin;
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }
}

async function firebaseConnection() {
  try {
    const snapshot = await realtime_db.ref("connection-test").once("value");
    console.log("Firebase Realtime Database connected successfully.");
  } catch (error) {
    console.error("Firebase Realtime Database connection error:", error);
  }
  return realtime_db; 
}

module.exports = { initFirebase, firebaseConnection, realtime_db, admin};
