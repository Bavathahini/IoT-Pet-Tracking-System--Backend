const mysql = require('mysql');
const util = require('util');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

let firebase_db_url = '-'; 
let otp_email = '-'; 
let otp_email_password = '-'; 

const dbConnection = () => {
    return new Promise((resolve, reject) => {
      connection.connect(async function (err) {
        if (err) {
          console.error('Error connecting to MySQL: ' + err.stack);
          reject(err);
          return;
        }
  
        console.log('Connected to MySQL as id ' + connection.threadId);
  
        const query = util.promisify(connection.query).bind(connection);
  
        try {
          const [settings] = await query(`SELECT * FROM tbl_settings WHERE id = ?`, [1]);
          if (settings && settings.firebase_db_url) {
            firebase_db_url = settings.firebase_db_url;
            otp_email = settings.otp_email;
            otp_email_password = settings.otp_email_password;
          }
          // Resolve with both the connection AND the URL
          resolve({ connection, firebase_db_url, otp_email, otp_email_password });
        } catch (queryErr) {
          console.error('Error fetching settings:', queryErr);
          reject(queryErr);
        }
      });
    });
  };

module.exports = {
  connection,
  dbConnection,
  get firebase_db_url() {
    return firebase_db_url, otp_email, otp_email_password;
  }
};