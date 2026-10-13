const http = require('http');
const app = require('../src/app');

jest.mock('../src/services/auth.service', () => ({
  AuthService: {
    login: jest.fn(),
  },
}));

let server;
let port;

beforeAll(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    port = server.address().port;
    resolve();
  });
}));

afterAll(() => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

describe('CORS preflight for Super Admin login', () => {
  test('handles OPTIONS preflight successfully for development origin 5174', async () => {
    const response = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  test('reaches the login route after preflight', async () => {
    const response = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5174',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
