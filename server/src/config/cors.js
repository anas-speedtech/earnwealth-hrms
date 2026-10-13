const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

// Local Vite may use 5174 when 5173 is already occupied. These are explicit development
// origins; credentials remain enabled and no wildcard origin is allowed.
const allowedOrigins = [...new Set([
  ...configuredOrigins,
  'http://localhost:5173',
  'http://localhost:5174',
])];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = { corsOptions };
