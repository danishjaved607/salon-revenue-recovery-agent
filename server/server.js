'use strict';

const app = require('./app');
const { initialise } = require('./config/database');

const PORT = process.env.PORT || 3000;

// Initialise DB (creates tables + seeds if empty) before accepting requests
initialise();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
