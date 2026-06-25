import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

const originalBasePath = process.env.REACT_APP_BASE_PATH;

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => []
  })) as jest.Mock;
});

afterEach(() => {
  process.env.REACT_APP_BASE_PATH = originalBasePath;
  window.history.pushState(null, '', '/');
});

test('renders CMS media gallery', async () => {
  render(<App />);

  await waitFor(() => expect(screen.getByRole('heading', { name: /demo cms/i })).toBeInTheDocument());
});

test('supports CMS basename route for split ingress', async () => {
  process.env.REACT_APP_BASE_PATH = '/cms';
  window.history.pushState(null, '', '/cms/about');

  render(<App />);

  await waitFor(() => expect(screen.getByRole('heading', { name: /about demo cms/i })).toBeInTheDocument());
});
