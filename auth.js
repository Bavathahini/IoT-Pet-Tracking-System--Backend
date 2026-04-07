const jwt = require('jsonwebtoken');

exports.isAuthenticated = async (req, res, next) => {
    try {
        let token;
        
        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Please login to access this resource'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        
        // Attach user to request object
        req.user = decoded;
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.Authenticated = async (req, res, next) => {
    try {
        // Get token from cookies
        const token = req.cookies.access_token;
        
        if (!token) {
            return res.redirect('/login');
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        
        // Check if user exists in database
        const db = req.app.locals.db;
        const user = await new Promise((resolve, reject) => {
            db.query('SELECT id, email, user_type, user_name FROM tbl_users WHERE id = ?', 
                    [decoded.id], 
                    (err, results) => {
                if (err) reject(err);
                resolve(results[0]);
            });
        });

        if (!user) {
            // return res.status(401).json({ message: 'User not found' });
            return res.redirect('/login');
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        
        // Handle expired token
        if (error.name === 'TokenExpiredError') {
            return tryRefreshToken(req, res, next);
        }
        
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Admin check middleware
exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.user_type === 'Admin') {
        return next();
    }
    // return res.status(403).json({ message: 'Admin access required' });
    return res.redirect('/not-authorized');
};

async function tryRefreshToken(req, res, next) {
    try {
        const refreshToken = req.cookies.refresh_token;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Session expired, please login again' });
        }

        const db = req.app.locals.db;
        
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_KEY);
        
        // Check if refresh token exists in database
        const tokenRecord = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM tbl_refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > NOW()', 
                    [refreshToken, decoded.id], 
                    (err, results) => {
                if (err) reject(err);
                resolve(results[0]);
            });
        });

        if (!tokenRecord) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Generate new access token
        const newAccessToken = jwt.sign(
            { id: decoded.id, email: decoded.email, user_type: decoded.user_type },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        );

        // Set new access token in cookie
        res.cookie('access_token', newAccessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        });

        // Attach user to request
        req.user = {
            id: decoded.id,
            email: decoded.email,
            user_type: decoded.user_type
        };
        
        next();
    } catch (error) {
        console.error(error);
        return res.status(401).json({ message: 'Session expired, please login again' });
    }
}