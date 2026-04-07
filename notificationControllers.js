exports.triggerNotification = async (req, res) => {
    try {
        const db = req.app.locals.db;
        const realtime_db = req.app.locals.fb_db;
        const messaging = req.app.locals.fb_admin.messaging();

        // Fetch pets and device ids
        const getPetDetails = () => {
            return new Promise((resolve, reject) => {
                const selectQry = 'SELECT id, name, track_device_id FROM tbl_pets WHERE user_id = ?';
                db.query(selectQry, [req.user.id], (err, results) => {
                    if (err) return reject(err);
                    resolve(results); // Each result contains id, pet_name, and track_device_id
                });
            });
        };

        const petDetails = await getPetDetails();
        const deviceIdMap = Object.fromEntries(
            petDetails.map(pet => [pet.track_device_id, pet])
        );

        // Fetch data from Firebase
        const snapshot = await realtime_db.ref('tracking_history').once('value');
        const data = snapshot.val();

        let result = data
            ? Object.entries(data).map(([key, value]) => ({
                tracking_device_id: key,
                ...value
            }))
            : [];

        // Filter only for user's pets
        result = result.filter(entry => deviceIdMap.hasOwnProperty(entry.tracking_device_id));

        // Filter temperature >= 30F and enrich with pet info
        const alertPets = result
            .filter(entry => {
                const temp = parseFloat(entry.temperature);
                return !isNaN(temp) && temp >= 30;
            })
            .map(entry => {
                const pet = deviceIdMap[entry.tracking_device_id];
                return {
                    pet_id: pet.id,
                    pet_name: pet.name,
                    tracking_device_id: entry.tracking_device_id,
                    temperature: entry.temperature
                };
            });

        // Optional: Prepare but skip sending notifications
        for (const pet of alertPets) {
            const message = {
                // token: token,
                notification: {
                    title: "Temperature Alert",
                    body: `Pet ${pet.pet_name} has a temperature of ${pet.temperature}`
                },
                data: {
                    tracking_device_id: pet.tracking_device_id,
                    temperature: pet.temperature
                }
            };

            // Commented out actual sending
            // try {
            //     await messaging.send(message);
            //     console.log(`Notification sent for device ${pet.tracking_device_id}`);
            // } catch (sendErr) {
            //     console.error(`Failed to send notification for device ${pet.tracking_device_id}:`, sendErr);
            // }
        }

        return res.status(200).json({
            success: true,
            message: alertPets.length > 0
                ? "Devices with temperature >= 30F found"
                : "No pets with temperature >= 30F found",
            pets: alertPets
        });
        

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
