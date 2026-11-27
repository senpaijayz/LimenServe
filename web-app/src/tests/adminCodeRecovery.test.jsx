import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '../modules/auth/pages/ForgotPasswordPage';
import ResetPasswordCodePage from '../modules/auth/pages/ResetPasswordCodePage';
import { requestAdministratorRecoveryCode, resetAdministratorPasswordWithCode, unlockAdministratorWithRecoveryCode } from '../services/authApi';

vi.mock('../services/authApi', () => ({
  requestAdministratorRecoveryCode: vi.fn(),
  resetAdministratorPasswordWithCode: vi.fn(),
  unlockAdministratorWithRecoveryCode: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  requestAdministratorRecoveryCode.mockResolvedValue({ message: 'Check your recovery inbox.' });
});

async function enterCode(page) {
  render(<MemoryRouter initialEntries={[{ pathname: '/', state: { signInEmail: 'admin@example.test' } }]}>{page}</MemoryRouter>);
  expect(screen.queryByLabelText(/^Email code$/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery code' }));
  fireEvent.change(await screen.findByLabelText(/^Email code$/), { target: { value: '12345678' } });
}

it('requests an administrator code and changes the password only after confirmation', async () => {
  resetAdministratorPasswordWithCode.mockResolvedValue({ message: 'Password changed.' });
  await enterCode(<ForgotPasswordPage />);
  const password = 'Example-Test-123!';
  const confirm = screen.getByLabelText('Confirm new password');
  fireEvent.change(screen.getByLabelText('New password', { exact: true }), { target: { value: password } });
  fireEvent.change(confirm, { target: { value: 'Not-the-same123!' } });
  const submit = screen.getByRole('button', { name: 'Verify code and change password' });
  fireEvent.click(submit);
  expect(screen.getByRole('alert').textContent).toContain('do not match');
  expect(resetAdministratorPasswordWithCode).not.toHaveBeenCalled();
  fireEvent.change(confirm, { target: { value: password } });
  fireEvent.click(submit);
  await screen.findByText('Password changed.');
  expect(requestAdministratorRecoveryCode).toHaveBeenCalledWith('admin@example.test');
  expect(resetAdministratorPasswordWithCode).toHaveBeenCalledWith({ email: 'admin@example.test', code: '12345678', password });
  expect(unlockAdministratorWithRecoveryCode).not.toHaveBeenCalled();
});

it('keeps the administrator unlock flow code-only', async () => {
  unlockAdministratorWithRecoveryCode.mockResolvedValue({ message: 'Sign-in unlocked.' });
  await enterCode(<ResetPasswordCodePage />);
  expect(screen.queryByLabelText('New password', { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Verify code and unlock sign-in' }));
  await screen.findByText('Sign-in unlocked.');
  expect(resetAdministratorPasswordWithCode).not.toHaveBeenCalled();
});
