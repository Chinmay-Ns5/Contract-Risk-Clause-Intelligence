import { redirect } from 'next/navigation';

// Self-registration is disabled: application accounts are real MySQL accounts
// managed in MySQL Workbench → Administration → Users and Privileges.
export default function SignupPage() {
  redirect('/login');
}
