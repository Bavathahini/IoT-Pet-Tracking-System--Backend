const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {sendOTP, sendAccountVerification} = require('../utils/verify');

// /api/auth/login => POST
exports.login = async (req, res) => {
    const { email, password } = req.body;
    // Input validation
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    if (!password) {
        return res.status(400).json({ message: 'Password is required' });
    }

    try {
        const db = req.app.locals.db;
        const checkQry = 'SELECT * FROM tbl_users WHERE email = ?';

        const results = await new Promise((resolve, reject) => {
            db.query(checkQry, [email], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = results[0];

        if(user.is_verified === 0){
            return res.status(200).json({
                success: true,
                message: 'Please verify your account first'
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Create JWT Access token
        const token = jwt.sign(
            { id: user.id, user_name: user.user_name, email: user.email, user_type: user.user_type },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        );

        // Create JWT Refresh token
        const refresh_token = jwt.sign(
            { id: user.id, user_name: user.user_name, email: user.email, user_type: user.user_type },
            process.env.JWT_REFRESH_KEY,
            {expiresIn: '30d'}
        )

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const insertQry = 'INSERT INTO tbl_refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)';
        await db.query(insertQry, [user.id, refresh_token, expiresAt]);

        res.cookie('access_token', token, {
            httpOnly: true,
            secure: true, // HTTPS only
            sameSite: 'Strict', // CSRF protection
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
          });
      
        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
        });

        res.json({
            success: true,
            message: 'Login successful',
            access_token: token,
            refresh_token: refresh_token
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
};

// /api/auth/register => POST
exports.register = async (req, res) => {
    const {email, user_name, password, user_type} = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    if(!email){
        return res.status(400).json({message: 'Email is required'});
    }

    if(!user_name){
        return res.status(400).json({message: 'Username is required'});
    }

    if(!password){
        return res.status(400).json({message: 'Password is required'});
    }

    try{
        const db = req.app.locals.db; 

        const checkQry = 'SELECT * FROM tbl_users WHERE email = ?';
        db.query(checkQry, [email], (checkError, checkResults) => {
            if (checkError) {
                console.error('Database error:', checkError);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            if (checkResults.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'User already exists'
                });
            }

            // Insert new user
            const insertQry = 'INSERT INTO tbl_users (email, user_name, password) VALUES (?, ?, ?)';
            db.query(insertQry, [email, user_name, hashedPassword], (insertError, insertResults) => {
                if (insertError) {
                    console.error('Database error:', insertError);
                    return res.status(500).json({
                        success: false,
                        message: 'Registration failed'
                    });
                }

                res.status(201).json({
                    success: true,
                    message: 'Registration successful',
                    id: insertResults.insertId
                });

                sendAccountVerification( email, insertResults.insertId);
            });
        });
        
    }catch(error){
        console.log(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

// /api/auth/logout => GET
exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;
        
        if (refreshToken) {
            const db = req.app.locals.db;
            await new Promise((resolve, reject) => {
                db.query('DELETE FROM tbl_refresh_tokens WHERE token = ?', 
                       [refreshToken], 
                       (err, result) => {
                    if (err) reject(err);
                    resolve(result);
                });
            });
        }

        res.clearCookie('access_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict'
        });
        
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict'
        });

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during logout'
        });
    }
};

// /api/auth/verify-account => POST
exports.verifyAccount = async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'Token is required'
        });
    }

    try {
        const db = req.app.locals.db;

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, message: 'Token has expired' });
            } else if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ success: false, message: 'Invalid token' });
            } else {
                throw err;
            }
        }

        if (!decoded.userId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid token payload'
            });
        }

        const checkQry = 'SELECT * FROM tbl_users WHERE id = ?';

        const results = await new Promise((resolve, reject) => {
            db.query(checkQry, [decoded.userId], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = results[0];

        if(user.is_verified === 1){
            return res.status(200).json({
                success: true,
                message: 'User is already verified',
            });
        }

        // Update verification status
        try {
            await db.query(`UPDATE tbl_users SET is_verified = ? WHERE id = ?`, [1, decoded.userId]);
        } catch (dbError) {
            console.error('DB error:', dbError);
            return res.status(500).json({
                success: false,
                message: 'Error verifying account'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Account verified successfully'
        });

    } catch (error) {
        console.error('Account verification error:', error);

        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(503).json({
                success: false,
                message: 'Database service unavailable'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

// /api/auth/forgot-password => POST
exports.forgotPasswordOTP = async (req, res) => {  
    const {email} = req.body;
    if(!email){
        return res.status(400).json({ message: 'Email is required' });
    }

    try {
        const db = req.app.locals.db;
        const checkQry = 'SELECT * FROM tbl_users WHERE email = ?';

        const results = await new Promise((resolve, reject) => {
            db.query(checkQry, [email], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = results[0];

        if(user.is_verified === 0) {
            return res.status(400).json({ message: 'Account is not verified' });
        }        

        const otp = await sendOTP(email);  
        return res.status(200).json({ 
            success: true,
            message: 'OTP sent successfully' 
        });
    } catch (error) {
        console.error("Failed to send OTP:", error);
        return res.status(500).json({ 
            success: false,
            message: 'Failed to send OTP'
        });
    }
}

// /api/auth/change-password => POST
exports.changePassword = async (req, res) => {
    const { otp, email, password } = req.body;
    
    if (!otp) return res.status(400).json({ message: 'OTP is required' });
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (!password) return res.status(400).json({ message: 'Password is required' });

    try {
        const db = req.app.locals.db;
        const now = new Date();
        const formattedDateTime = now.toISOString().slice(0, 19).replace('T', ' ');

        const checkQry = 'SELECT * FROM tbl_otp_verification WHERE otp = ? AND email = ? AND expires_at > ?';

        const results = await new Promise((resolve, reject) => {
            db.query(checkQry, [otp, email, formattedDateTime], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'OTP invalid or expired'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(`UPDATE tbl_users SET password = ? WHERE email = ?`, [hashedPassword, email]);

        await db.query(`DELETE FROM tbl_otp_verification WHERE otp = ?`, [otp]);

        return res.status(200).json({ success: true, message: 'Password changed successfully' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};