'use strict';

const app = require('./app');
const { initialise } = require('./config/database');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialise DB (creates tables + seeds if empty) before accepting requests
initialise();

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (port: ${PORT})`);
});
