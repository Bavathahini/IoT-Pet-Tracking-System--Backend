exports.authorize = (roles = []) => {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return async (req, res, next) => {
        if (!req.user || !req.user.id) {
            return res.status(401).send({ message: 'Authentication required' });
        }

        try {
            const db = req.app.locals.db;
            const selectQry = 'SELECT * FROM tbl_users WHERE id = ?';

            const results = await new Promise((resolve, reject) => {
                db.query(selectQry, [req.user.id], (err, results) => {
                    if (err) {
                        console.error('Database error:', err);
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });

            if (!results || results.length === 0) {
                return res.status(404).send({ message: 'User not found' });
            }
            
            const user = results[0];
            let userType = user.user_type;
            
            if (roles.length === 0 || roles.includes(userType)) {
                return next();
            }

            return res.status(403).send({ message: 'Access denied' });

        } catch (err) {
            console.error('Authorization error:', err);
            return res.status(500).send({ message: 'Authorization check failed' });
        }
    };
}