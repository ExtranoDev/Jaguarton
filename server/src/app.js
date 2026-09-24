const express = require('express');
const cors = require('cors');
const { corsOrigins } = require('./config/env');
const { securityHeaders } = require('./middleware/securityHeaders');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const stationsRoutes = require('./modules/stations/stations.routes');
const chargersRoutes = require('./modules/chargers/chargers.routes');
const slotsRoutes = require('./modules/slots/slots.routes');
const bookingsRoutes = require('./modules/bookings/bookings.routes');
const adminRoutes = require('./modules/admin/admin.routes');

const app = express();

app.disable('x-powered-by');
// Render puts one proxy in front of the app; trusting exactly that hop makes req.ip the client's
// address (used by the login throttle) without letting a client spoof it via X-Forwarded-For.
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api', authRoutes);
app.use('/api', stationsRoutes);
app.use('/api', chargersRoutes);
app.use('/api', slotsRoutes);
app.use('/api', bookingsRoutes);
app.use('/api', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
