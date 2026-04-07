const bcrypt = require('bcrypt');

// /api/admin/create-user => POST
exports.createUser =  async (req, res) => {
    const { email, user_name, password } = req.body;
    const user_type = 'Admin';
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    if (!user_name) {
        return res.status(400).json({ message: 'Username is required' });
    }

    if (!password) {
        return res.status(400).json({ message: 'Password is required' });
    }

    try {
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

            let insertQry, insertParams;
            
            insertQry = 'INSERT INTO tbl_users (email, user_name, password, user_type, is_verified) VALUES (?, ?, ?, ?, ?)';
            insertParams = [email, user_name, hashedPassword, user_type, 1];
            

            db.query(insertQry, insertParams, (insertError, insertResults) => {
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

            });
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

// /api/admin/update-settings => POST
exports.updateSettings = async (req, res) => {
    const { firebase_db_url, otp_email, otp_email_password } = req.body;

    try {
        const db = req.app.locals.db;

        const query = `
            INSERT INTO tbl_settings (id, firebase_db_url, otp_email, otp_email_password) 
            VALUES (1, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            firebase_db_url = VALUES(firebase_db_url),
            otp_email = VALUES(otp_email),
            otp_email_password = VALUES(otp_email_password)
        `;
        
        const params = [firebase_db_url, otp_email, otp_email_password];

        db.query(query, params, (error, results) => {
            if (error) {
                console.error('Database error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Operation failed'
                });
            }

            const message = results.affectedRows === 1 ? 
                'Settings updated successfully' : 
                'Settings updated successfully';
                
            res.status(200).json({
                success: true,
                message: message,
                id: 1
            });
        });

    } catch(error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Internal Server Error' 
        });
    }
}

// /api/admin/user-status-change => POST
exports.userStatusChange = async (req, res) => {
    const { user_id, status } = req.body;
    let cur_status;

    if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    if (!status) {
        return res.status(400).json({ message: 'Status is required' });
    }

    if(status === 'activate'){
        cur_status = 1;
    }

    if(status === 'deactivate'){
        cur_status = 0;
    }

    try {
        const db = req.app.locals.db;

        const checkQry = 'SELECT * FROM tbl_users WHERE id = ?';
        db.query(checkQry, [user_id], (checkError, checkResults) => {
            if (checkError) {
                console.error('Database error:', checkError);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            if (checkResults.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const updateQry = 'UPDATE tbl_users SET is_active = ? WHERE id = ?';
            const updateParams = [cur_status, user_id];

            db.query(updateQry, updateParams, (updateError, updateResults) => {
                if (updateError) {
                    console.error('Database error:', updateError);
                    return res.status(500).json({
                        success: false,
                        message: 'Status update failed'
                    });
                }

                res.status(200).json({
                    success: true,
                    message: 'Status updated successfully'
                });
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

// /api/admin/get-details => GET
exports.getAdminDetails = async(req, res) => {
    return res.status(200).json({
        success: true,
        data: req.user
    });
}

// /api/admin/change-password => POST
exports.changePassword = async(req, res) => {
    const { old_password, new_password } = req.body;
    
    if (!old_password) {
        return res.status(400).json({ message: 'Old password is required' });
    }

    if (!new_password) {
        return res.status(400).json({ message: 'New password is required' });
    }

    try {
        const db = req.app.locals.db;

        const checkQry = 'SELECT * FROM tbl_users WHERE id = ?';
        db.query(checkQry, [req.user.id], async (checkError, checkResults) => {
            if (checkError) {
                console.error('Database error:', checkError);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            if (checkResults.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const user = checkResults[0];
            const isMatch = await bcrypt.compare(old_password, user.password);

            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Old password is incorrect'
                });
            }

            // Hash the new password
            const salt = await bcrypt.genSalt(10);
            const hashed_password = await bcrypt.hash(new_password, salt);

            const updateQry = 'UPDATE tbl_users SET password = ? WHERE id = ?';
            const updateParams = [hashed_password, req.user.id];

            db.query(updateQry, updateParams, (updateError, updateResults) => {
                if (updateError) {
                    console.error('Database error:', updateError);
                    return res.status(500).json({
                        success: false,
                        message: 'Password update failed'
                    });
                }

                res.status(200).json({
                    success: true,
                    message: 'Password updated successfully'
                });
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ 
            success: false,
            message: 'Internal Server Error' 
        });
    }
}