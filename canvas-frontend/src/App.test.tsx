import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

test('renders whiteboard board list', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => []
  })) as jest.Mock;

  render(<App />);

  await waitFor(() => expect(screen.getByRole('heading', { name: /whiteboard boards/i })).toBeInTheDocument());
});
