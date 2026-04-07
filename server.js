const dotenv = require('dotenv').config({path: 'config/.env'});
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
app.set('view engine', 'ejs');
app.set('views', 'views');
app.use(express.static(path.join(__dirname, 'public')));
const util = require('util');
const dayjs = require('dayjs');

const {dbConnection, connection, admin, firebase_db_url, otp_email, otp_email_password} = require('./config/database');
const { initFirebase, firebaseConnection } = require('./config/firebase');

const cron = require('node-cron');
const {getDataFromFirebase} = require('./cron/cron.js');

const rateLimit = require('express-rate-limit');
app.use(express.json());
app.use(cookieParser());
const baseUrl = (process.env.NODE_ENV === "development") ? "http://localhost:4000" : process.env.BASE_URL;
app.use(cors({
    origin: baseUrl, 
    credentials: true,
  }));

const rateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: { 
    error: "Too many requests, please wait 5 minutes before trying again." 
  },
  standardHeaders: true, 
  legacyHeaders: false, 
});


// Routes
const authRoutes = require('./routes/authRoutes');
const petRoutes = require('./routes/petRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes.js');

const {Authenticated, isAdmin} = require('./middlewares/auth.js');

// VIEWS
app.get('/', (req, res)=>{
  res.render('index');
});
app.get('/login', (req, res)=>{
  res.render('login',{baseUrl});
});
// app.get('/register', (req, res)=>{
//   res.render('register',{baseUrl});
// });
app.get('/verify-account', (req,res)=>{
  res.render('verify-account',{baseUrl});
});

app.get('/admin-dashboard', Authenticated, isAdmin, async (req, res) => {
  const db = req.app.locals.db;
  const query = util.promisify(db.query).bind(db);

    const petsResult = await query('SELECT COUNT(id) AS count FROM tbl_pets');
    const usersResult = await query('SELECT COUNT(id) AS count FROM tbl_users WHERE user_type = ?', ['Pet Owner']);

    const today = dayjs().format('YYYY-MM-DD');

    const userData = await query(
      `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
       FROM tbl_users u
       LEFT JOIN tbl_pets p ON p.user_id = u.id
       WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
       GROUP BY u.id`,
      ['Pet Owner', 1, today, 1]
    );
    

    const petsCount = petsResult[0].count;
    const usersCount = usersResult[0].count;

    res.render('admin-dashboard', {
      baseUrl,
      currentRoute: req.path,
      usersCount,
      petsCount, userCount: userData.length
    });
});

app.get('/pet-owner-management',Authenticated, async (req, res)=>{
  const db = req.app.locals.db;
  const query = util.promisify(db.query).bind(db);

  const today = dayjs().format('YYYY-MM-DD');

  const userData = await query(
    `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
     FROM tbl_users u
     LEFT JOIN tbl_pets p ON p.user_id = u.id
     WHERE u.user_type = ? AND u.is_verified = ? AND u.is_active = ?
     GROUP BY u.id`,
    ['Pet Owner', 1, 1]
  );

  const userDataTdy = await query(
    `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
     FROM tbl_users u
     LEFT JOIN tbl_pets p ON p.user_id = u.id
     WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
     GROUP BY u.id`,
    ['Pet Owner', 1, today, 1]
  );

  res.render('pet-owner-management',{baseUrl, currentRoute: req.path, userData, userCount: userDataTdy.length
  });
});

app.get('/user-management',Authenticated, async (req, res)=>{
  const db = req.app.locals.db;
  const query = util.promisify(db.query).bind(db);

  const today = dayjs().format('YYYY-MM-DD');

    const userData = await query(
      `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
       FROM tbl_users u
       LEFT JOIN tbl_pets p ON p.user_id = u.id
       WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
       GROUP BY u.id`,
      ['Pet Owner', 1, today, 1]
    );
    
    const memData = await query(
      `SELECT * FROM tbl_users WHERE user_type = ? AND id != ?`,
      ['Admin', req.user.id]
    );

  res.render('user-management',{baseUrl, currentRoute: req.path, memData, userCount: userData.length
  });
});

app.get('/notifications',Authenticated, async (req, res)=>{
  const db = req.app.locals.db;
  const query = util.promisify(db.query).bind(db);

  const today = dayjs().format('YYYY-MM-DD');

    const userData = await query(
      `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
       FROM tbl_users u
       LEFT JOIN tbl_pets p ON p.user_id = u.id
       WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
       GROUP BY u.id`,
      ['Pet Owner', 1, today, 1]
    );

  res.render('notifications',{baseUrl, currentRoute: req.path, userData, userCount: userData.length
  });
});

app.get('/settings',Authenticated, async (req, res)=>{
    const db = req.app.locals.db;
    const query = util.promisify(db.query).bind(db);

    const today = dayjs().format('YYYY-MM-DD');

    const userData = await query(
      `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
       FROM tbl_users u
       LEFT JOIN tbl_pets p ON p.user_id = u.id
       WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
       GROUP BY u.id`,
      ['Pet Owner', 1, today, 1]
    );

    const [settings] = await query(
      `SELECT * FROM tbl_settings WHERE id = ?`,
      [1]
    );

    let firebase_db_url = '-';
    let otp_email = '-';
    let otp_email_password = '-';

    if (settings) {
      ({ firebase_db_url, otp_email, otp_email_password } = settings);
    } 

    res.render('settings',{baseUrl, currentRoute: req.path, userCount: userData.length, 
      firebase_db_url, otp_email, otp_email_password
    });
});

app.get('/change-password', async (req, res) => {
  const db = req.app.locals.db;
  const query = util.promisify(db.query).bind(db);

  const today = dayjs().format('YYYY-MM-DD');

  const userData = await query(
    `SELECT u.user_name, u.email, COUNT(p.id) AS pet_count
     FROM tbl_users u
     LEFT JOIN tbl_pets p ON p.user_id = u.id
     WHERE u.user_type = ? AND u.is_verified = ? AND DATE(u.created_at) = ? AND u.is_active = ?
     GROUP BY u.id`,
    ['Pet Owner', 1, today, 1]
  );

  res.render('change-password',{baseUrl, currentRoute: req.path, userCount: userData.length});
})

app.get('/not-authorized', (req, res) => {
  res.render('not-authorized',{baseUrl, currentRoute: req.path});
});

// APIs 
app.use('/api/auth', rateLimiter, authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/listen/', notificationRoutes);

app.use((req, res) => {
  res.render('not-found', {baseUrl, currentRoute: req.path});
});

(async () => {
    try {
        // DB connection
        const { connection: dbConn, firebase_db_url: url, otp_email, otp_email_password} = await dbConnection();

        app.locals.db = connection;
        global.firebase_db_url = url;
        global.otp_email = otp_email;
        global.otp_email_password = otp_email_password;
        if(url && url!= '-'){
        const admin = initFirebase(); 
        const fb_db = await firebaseConnection(); 
        app.locals.fb_db = fb_db;
        app.locals.fb_admin = admin;

        cron.schedule('*/5 * * * *', () => {
          getDataFromFirebase(fb_db);
        });
      }
        
        app.listen(process.env.PORT || 3000, () => {
            console.log('Server is running');
        });
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
})();