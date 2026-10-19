const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

// Vite picks 5173, then walks upward when ports are taken, so an allowlist of
// fixed ports breaks every time it lands on an unused one. Development allows
// any localhost/127.0.0.1 port on any scheme; production uses CORS_ORIGIN only.
const isDevLocalhost = (origin) => {
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
    );
  } catch {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    // No Origin header (curl, server-to-server, same-origin) is not a browser
    // cross-origin request, so there is nothing to restrict.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (configuredOrigins.includes(origin) || isDevLocalhost(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = { corsOptions };
