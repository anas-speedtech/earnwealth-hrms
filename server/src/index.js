const { env } = require('./config/env');
const app = require('./app');

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`EWS HRMS API running on port ${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

module.exports = app;
