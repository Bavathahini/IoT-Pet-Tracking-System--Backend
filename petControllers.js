const {realtime_db} = require('../config/firebase');

// /api/pets => GET
exports.getAllPets = (req, res) => {
    try {
        const db = req.app.locals.db;

        const selectQry = 'SELECT * FROM tbl_pets WHERE user_id = ?';

        db.query(selectQry, [req.user.id], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            const processedPets = results.map(pet => {
                let imageBase64 = null;
                if (pet.image) {
                    imageBase64 = pet.image.toString('base64');
                }
                
                return {
                    ...pet,
                    image: imageBase64
                };
            });


            return res.status(200).json({
                success: true,
                records: processedPets.length,
                data: processedPets,
                message: 'Pets retrieved successfully'
            });
        });

    } catch(error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
}

// /api/pets/:id => GET
exports.getSinglePetDetails = (req, res) => {
    try {
        const db = req.app.locals.db;
        const {id} = req.params;

        const selectQry = 'SELECT * FROM tbl_pets WHERE id = ?';

        db.query(selectQry, [id], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Pet not found'
                });
            }

            const petData = results[0];
            
            let imageBase64 = null;
            if (petData.image) {
                imageBase64 = petData.image.toString('base64');
            }

            let additionalData = {
                "latitude": "1.11",
                "longitude": "1.11"
            };

            return res.status(200).json({
                success: true,
                data: {...petData, ...additionalData,
                image: imageBase64},
                message: 'Pets retrieved successfully'
            });
        });

    } catch(error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
}

// /api/pets/create => POST
exports.createPet = (req, res) => {
    const { name, age, weight, breed, track_device_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Pet image is required' });
    }

    const imageBuffer = req.file.buffer;

    if(!name){
        return res.status(400).json({message: 'Name is required'});
    }

    if(!age){
        return res.status(400).json({message: 'Age is required'});
    }

    if(!weight){
        return res.status(400).json({message: 'Weight is required'});
    }

    if(!breed){
        return res.status(400).json({message: 'Breed is required'});
    }
    
    if(!track_device_id){
        return res.status(400).json({message: 'Track device id is required'});
    }

    try{

        const db = req.app.locals.db; 

        const checkQry = 'SELECT * FROM tbl_pets WHERE name = ? AND user_id = ?';

        db.query(checkQry, [name, req.user.id], (checkError, checkResults) => {
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
                    message: 'Pet already exists'
                });
            }

            // Insert new pet
            const insertQry = 'INSERT INTO tbl_pets (name, age, weight, breed, user_id, track_device_id, image) VALUES (?, ?, ?, ?, ?, ?, ?)';
            db.query(insertQry, [name, age, weight, breed, req.user.id, track_device_id, imageBuffer], (insertError, insertResults) => {
                if (insertError) {
                    console.error('Database error:', insertError);
                    return res.status(500).json({
                        success: false,
                        message: 'Pet creation failed'
                    });
                }

                res.status(201).json({
                    success: true,
                    message: 'Pet created successfully',
                    id: insertResults.insertId
                });
            });
        });

    }catch(error){
        console.error(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

// /api/pets/edit/:id => PUT
exports.updatePet = (req, res) => {
    const { id } = req.params;
    const { name, age, weight, breed, track_device_id } = req.body;
    const imageBuffer = req.file ? req.file.buffer : null;

    if (!id) {
        return res.status(400).json({ 
            success: false,
            message: 'Pet ID is required' 
        });
    }

    const db = req.app.locals.db;

    // Check if pet exists and belongs to the user
    const checkQuery = 'SELECT * FROM tbl_pets WHERE id = ? AND user_id = ?';
    db.query(checkQuery, [id, req.user.id], (checkError, checkResults) => {
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
                message: 'Pet not found or not owned by user' 
            });
        }

        const currentPet = checkResults[0];

        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (age !== undefined) {
            updates.push('age = ?');
            values.push(age);
        }
        if (weight !== undefined) {
            updates.push('weight = ?');
            values.push(weight);
        }
        if (breed !== undefined) {
            updates.push('breed = ?');
            values.push(breed);
        }
        if (track_device_id !== undefined) {
            updates.push('track_device_id = ?');
            values.push(track_device_id);
        }
        if (imageBuffer !== null) {
            updates.push('image = ?');
            values.push(imageBuffer);
        }

        if (updates.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'No valid fields provided for update' 
            });
        }

        const checkNameUniqueness = (callback) => {
            if (name === undefined || name === currentPet.name) {
                return callback(null);
            }

            const nameCheckQuery = 'SELECT id FROM tbl_pets WHERE name = ? AND user_id = ? AND id != ?';
            db.query(nameCheckQuery, [name, req.user.id, id], (nameCheckError, nameCheckResults) => {
                if (nameCheckError) {
                    console.error('Database error:', nameCheckError);
                    return callback('Database error');
                }

                if (nameCheckResults.length > 0) {
                    return callback('Another pet with this name already exists');
                }

                callback(null);
            });
        };

        checkNameUniqueness((nameError) => {
            if (nameError) {
                return res.status(nameError === 'Database error' ? 500 : 409).json({ 
                    success: false,
                    message: nameError 
                });
            }

            // Perform the update
            const updateQuery = `UPDATE tbl_pets SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
            const updateValues = [...values, id, req.user.id];

            db.query(updateQuery, updateValues, (updateError, updateResults) => {
                if (updateError) {
                    console.error('Update error:', updateError);
                    return res.status(500).json({ 
                        success: false,
                        message: 'Failed to update pet' 
                    });
                }

                if (updateResults.affectedRows === 0) {
                    return res.status(404).json({ 
                        success: false,
                        message: 'Pet not found or not owned by user' 
                    });
                }

                return res.status(200).json({ 
                    success: true,
                    message: 'Pet updated successfully' 
                });
            });
        });
    });
};

// /api/pets/:id => DELETE
exports.deletePet = (req, res) => {
    const { id } = req.params;

    if(!id){
        return res.status(400).json({message: 'Pet ID is required'});
    }

    try{
        const db = req.app.locals.db;

        // First check if pet exists and belongs to the user
        const checkQry = 'SELECT * FROM tbl_pets WHERE id = ? AND user_id = ?';
        
        db.query(checkQry, [id, req.user.id], (checkError, checkResults) => {
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
                    message: 'Pet not found or not owned by user'
                });
            }

            // Delete the pet
            const deleteQry = 'DELETE FROM tbl_pets WHERE id = ? AND user_id = ?';
            db.query(deleteQry, [id, req.user.id], (deleteError, deleteResults) => {
                if (deleteError) {
                    console.error('Database error:', deleteError);
                    return res.status(500).json({
                        success: false,
                        message: 'Pet deletion failed'
                    });
                }

                if (deleteResults.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Pet not found or not owned by user'
                    });
                }

                res.status(200).json({
                    success: true,
                    message: 'Pet deleted successfully'
                });
            });
        });

    } catch(error) {
        console.error(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

// /api/pets/live-tracking => POST
exports.getLiveTracking = async (req, res) => {
    try {
        const {tracking_device_id} = req.body;
        const realtime_db = req.app.locals.fb_db;

        const snapshot = await realtime_db.ref('tracking_history').once('value');
        const data = snapshot.val();

        let result = data
            ? Object.entries(data).map(([key, value]) => ({
                tracking_device_id: key,
                ...value
            }))
            : [];

        result = result.filter(entry => entry.tracking_device_id === tracking_device_id);

        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

// /api/pets/report => POST
exports.getReport = (req, res) => {
    try {
        const db = req.app.locals.db;
        const { pet_id, date, start_time, end_time } = req.body;
        const user_id = req.user.id;

        let query;
        const conditions = [];
        const params = [user_id]; 

        const joinCondition = 'th.pet_id = p.id AND p.user_id = ?';

        if (pet_id && pet_id != 0 && pet_id != '' ) {
            conditions.push('th.pet_id = ?');
            params.push(pet_id);
        }

        if (date && date != 0 && date != '') {
            conditions.push('DATE(th.date) = ?');
            params.push(date);
        } else {
            const currentDate = new Date().toISOString().split('T')[0];
            conditions.push('DATE(th.date) = ?');
            params.push(currentDate);
        }

        if (start_time && start_time != 0 && start_time != '') {
            const formattedStart = start_time.includes(':') 
                ? start_time.padEnd(8, ':00') 
                : start_time + ':00';
            conditions.push('TIME(th.date) >= ?');
            params.push(formattedStart);
        }

        if (end_time && end_time != 0 && end_time != '') {
            const formattedEnd = end_time.includes(':') 
                ? end_time.padEnd(8, ':59') 
                : end_time + ':59';
            conditions.push('TIME(th.date) <= ?');
            params.push(formattedEnd);
        }

        query = `SELECT 
                    th.id,
                    th.tracking_device_id,
                    th.longitude,
                    th.latitude,
                    th.temperature, 
                    th.pet_id,
                    DATE_FORMAT(th.date, '%Y-%m-%d %H:%i:%s') as date,
                    p.name as pet_name
                 FROM tbl_tracking_history th
                 INNER JOIN tbl_pets p ON ${joinCondition}
                 ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
                 ORDER BY th.date DESC`;

        db.query(query, params, (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error',
                    error: err.message
                });
            }
            
            if (results.length === 0) {
                return res.status(200).json({
                    success: true,
                    records: 0,
                    data: [],
                    message: 'No records found'
                });
            }

            return res.status(200).json({
                success: true,
                records: results.length,
                data: results,
                message: 'Report generated successfully'
            });
        });

    } catch(error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

// /api/pets/geo-fence => GET
exports.getGeoFence = (req, res) => {
    try{
        const db = req.app.locals.db;
        const {user_id, geo1, geo2, geo3, geo4} = req.body;
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
}

// /api/pets/dropdown => GET
exports.getPetDropdown = (req, res) => {
    try{
        const db = req.app.locals.db;

        const selectQry = 'SELECT name, id FROM tbl_pets WHERE user_id = ?';

        db.query(selectQry, [req.user.id], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            return res.status(200).json({
                success: true,
                records: results.length,
                data: results
            });
        });

    } catch(error){
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}